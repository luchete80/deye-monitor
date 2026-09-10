"""Generate a 24-hour SQLite history suitable for the dashboard plot."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import math

from deye_monitor.history import HistoryStore


def snapshot(hours_ago: float) -> dict:
    # Solar follows a daylight bell; load and battery/grid flows vary smoothly.
    local_hour = (datetime.now().astimezone().hour - hours_ago) % 24
    daylight = max(0.0, math.sin(math.pi * (local_hour - 6) / 12))
    pv = round(5200 * daylight**1.7, 1)
    load = round(650 + 280 * math.sin(hours_ago * 1.8) ** 2 + (850 if 19 <= local_hour <= 23 else 0), 1)
    balance = pv - load
    battery = round(min(1400, max(0, balance * 0.45)), 1)
    grid = round(max(0, load - pv), 1)
    soc = round(min(96, max(28, 62 + 22 * math.sin(math.pi * (local_hour - 8) / 12))), 1)
    return {
        "solar": {"total_power_w": pv},
        "load": {"total_power_w": load},
        "battery": {"power_w": battery, "soc_pct": soc},
        "grid": {"power_w": grid},
        "field_freshness": {
            "solar": {"total_power_w": True},
            "load": {"total_power_w": True},
            "battery": {"power_w": True, "soc_pct": True},
            "grid": {"power_w": True},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="data/dummy-24h.sqlite3")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    history = HistoryStore(args.path, retention_hours=25)
    for minutes_ago in range(24 * 60, -1, -5):
        captured_at = now - timedelta(minutes=minutes_ago)
        history.record(snapshot(minutes_ago / 60), captured_at)
    print(f"Generated 289 samples in {args.path}")


if __name__ == "__main__":
    main()
