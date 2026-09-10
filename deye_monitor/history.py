from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import threading


SCHEMA_VERSION = 1
RANGES = {"1h": 1, "6h": 6, "12h": 12, "24h": 24}
HISTORY_FIELDS = (
    ("solar", "total_power_w", "pv_power_w"),
    ("load", "total_power_w", "home_power_w"),
    ("battery", "power_w", "battery_power_w"),
    ("grid", "power_w", "grid_power_w"),
    ("battery", "soc_pct", "soc_pct"),
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds")


class HistoryStore:
    """SQLite-backed, bounded raw snapshots. Connections are short-lived for thread safety."""

    def __init__(self, path: str, retention_hours: float = 24, clock=utcnow):
        self.path, self.retention, self.clock = path, timedelta(hours=retention_hours), clock
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._connection = sqlite3.connect(path, timeout=10, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._migrate()

    def _connect(self) -> sqlite3.Connection:
        return self._connection

    def _migrate(self) -> None:
        with self._lock, self._connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError(f"history database schema {version} is newer than supported {SCHEMA_VERSION}")
            if version < 1:
                connection.execute("""
                    CREATE TABLE snapshots (
                      captured_at TEXT PRIMARY KEY,
                      pv_power_w REAL NOT NULL,
                      home_power_w REAL NOT NULL,
                      battery_power_w REAL NOT NULL,
                      grid_power_w REAL NOT NULL,
                      soc_pct REAL NOT NULL
                    )
                """)
                connection.execute("PRAGMA user_version = 1")

    @staticmethod
    def complete(snapshot: dict) -> bool:
        for group, field, _ in HISTORY_FIELDS:
            value = snapshot.get(group, {}).get(field)
            fresh = snapshot.get("field_freshness", {}).get(group, {}).get(field)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not fresh:
                return False
        return True

    def record(self, snapshot: dict, captured_at: datetime | None = None) -> bool:
        """Atomically save only a complete, fresh snapshot and trim expired rows."""
        captured_at = captured_at or self.clock()
        if not self.complete(snapshot):
            self.prune(captured_at)
            return False
        values = [snapshot[group][field] for group, field, _ in HISTORY_FIELDS]
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?, ?)",
                (timestamp(captured_at), *values),
            )
            connection.execute("DELETE FROM snapshots WHERE captured_at < ?", (timestamp(captured_at - self.retention),))
        return True

    def prune(self, now: datetime | None = None) -> None:
        now = now or self.clock()
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM snapshots WHERE captured_at < ?", (timestamp(now - self.retention),))

    def query(self, range_name: str, now: datetime | None = None) -> list[dict]:
        if range_name not in RANGES:
            raise ValueError("range must be one of: 1h, 6h, 12h, 24h")
        now = now or self.clock()
        hours = min(RANGES[range_name], self.retention.total_seconds() / 3600)
        cutoff = timestamp(now - timedelta(hours=hours))
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT captured_at, pv_power_w, home_power_w, battery_power_w, grid_power_w, soc_pct "
                "FROM snapshots WHERE captured_at >= ? ORDER BY captured_at", (cutoff,)
            ).fetchall()
        return [dict(row) for row in rows]


class SnapshotRecorder:
    def __init__(self, state, history: HistoryStore, interval_seconds: float):
        self.state, self.history, self.interval = state, history, interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True, name="deye-history-recorder")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread: self._thread.join(timeout=self.interval + 1)

    def record_once(self) -> bool:
        return self.history.record(self.state.snapshot())

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self.record_once()
