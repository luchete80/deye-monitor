"""Persistent daily energy ledger; raw plot retention never deletes these totals."""
from __future__ import annotations

import calendar
import math
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def valid(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def positive_integral(left, right, seconds):
    """Integral of positive part of a linear power segment, including zero crossings."""
    if left >= 0 and right >= 0:
        return (left + right) / 2 * seconds / 3_600_000
    if left <= 0 and right <= 0:
        return 0.0
    positive = max(left, right)
    return positive / 2 * seconds * positive / abs(right - left) / 3_600_000


class EnergyStore:
    def __init__(self, config):
        self.config = config
        self.zone = ZoneInfo(config.timezone)
        self.max_gap = max(config.history_interval_seconds * 2.5, config.stale_after_seconds)
        self._lock = threading.RLock()
        self._previous = {}
        self._counters = {}
        self.db = sqlite3.connect(config.history_db_path, timeout=10, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.db:
            self.db.execute("CREATE TABLE IF NOT EXISTS energy_days (day TEXT, metric TEXT, kwh REAL NOT NULL, seconds REAL NOT NULL, PRIMARY KEY(day, metric))")
            self.db.execute("CREATE TABLE IF NOT EXISTS energy_resets (month TEXT PRIMARY KEY, baseline REAL NOT NULL, reset_at TEXT NOT NULL)")

    def record(self, snapshot, now=None):
        now = now or datetime.now(timezone.utc)
        offline = (not snapshot.get('flow', {}).get('simulated') and snapshot.get('connectivity', {}).get('broker') == 'disconnected') or any(snapshot.get('connectivity', {}).get(k) == 'offline' for k in ('service', 'logger'))
        with self._lock, self.db:
            for metric, group in (('home', 'load'), ('solar', 'solar'), ('grid_import', 'grid'), ('grid_export', 'grid')):
                field = 'power_w' if group == 'grid' else 'total_power_w'
                value = snapshot.get(group, {}).get(field)
                fresh = snapshot.get('field_freshness', {}).get(group, {}).get(field) is True
                if offline or not fresh or not valid(value):
                    self._previous.pop(metric, None)
                    self._counters.pop(metric, None)
                    continue
                if metric == 'grid_export':
                    value = -value
                counter_field = 'energy_bought_today_kwh' if metric == 'grid_import' else 'energy_sold_today_kwh'
                counter = snapshot.get('grid', {}).get(counter_field) if group == 'grid' else None
                if not snapshot.get('field_freshness', {}).get('grid', {}).get(counter_field) or not valid(counter) or counter < 0:
                    counter = None
                previous = self._previous.get(metric)
                self._previous[metric] = (now, value, counter)
                if previous is None:
                    if counter is not None:
                        day = now.astimezone(self.zone).date().isoformat()
                        row = self.db.execute("SELECT kwh FROM energy_days WHERE day=? AND metric=?", (day, metric)).fetchone()
                        self._counters[metric] = (day, counter, row['kwh'] if row else 0, now)
                    continue
                start, left, old_counter = previous
                seconds = (now - start).total_seconds()
                if seconds <= 0 or seconds > self.max_gap:
                    self._counters.pop(metric, None)
                    continue
                cursor = start
                while cursor < now:
                    local = cursor.astimezone(self.zone)
                    midnight = datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), self.zone).astimezone(timezone.utc)
                    end = min(now, midnight)
                    duration = (end - cursor).total_seconds()
                    a = left + (value - left) * (cursor - start).total_seconds() / seconds
                    b = left + (value - left) * (end - start).total_seconds() / seconds
                    kwh = positive_integral(a, b, duration)
                    self.db.execute("INSERT INTO energy_days VALUES (?, ?, ?, ?) ON CONFLICT(day, metric) DO UPDATE SET kwh=kwh+excluded.kwh, seconds=seconds+excluded.seconds", (local.date().isoformat(), metric, kwh, duration))
                    cursor = end
                # Reconcile power estimates only when a daily device counter changes.
                # Repeated/rounded counter readings must not erase measured intervals.
                day = now.astimezone(self.zone).date().isoformat()
                if counter is not None:
                    baseline = self._counters.get(metric)
                    total = self.db.execute("SELECT kwh FROM energy_days WHERE day=? AND metric=?", (day, metric)).fetchone()['kwh']
                    if baseline is None or baseline[0] != day or seconds > self.max_gap:
                        self._counters[metric] = (day, counter, total, now)
                    elif counter != baseline[1]:
                        _, old, base_total, counter_at = baseline
                        elapsed = (now - counter_at).total_seconds()
                        delta = counter - old
                        limit = max(abs(left), abs(value), self.config.gauge_grid_max_w) * elapsed / 3_600_000 * 2 + .02
                        if 0 <= delta <= limit:
                            self.db.execute("UPDATE energy_days SET kwh=? WHERE day=? AND metric=?", (base_total + delta, day, metric))
                            total = base_total + delta
                        self._counters[metric] = (day, counter, total, now)
                else:
                    self._counters.pop(metric, None)

    def _period(self, metric, start, end, now):
        rows = self.db.execute("SELECT SUM(kwh) AS kwh, SUM(seconds) AS seconds FROM energy_days WHERE metric=? AND day>=? AND day<?", (metric, start.date().isoformat(), end.date().isoformat())).fetchone()
        expected = max(0, (min(now, end.astimezone(timezone.utc)) - start.astimezone(timezone.utc)).total_seconds())
        covered = rows['seconds'] or 0
        return {'kwh': rows['kwh'] if covered else None, 'coverage_seconds': covered,
                'complete': covered >= max(0, expected - self.max_gap) and covered > 0,
                'start': start.isoformat(), 'end': end.isoformat()}

    def summary(self, now=None):
        now = now or datetime.now(timezone.utc)
        local = now.astimezone(self.zone)
        day = local.replace(hour=0, minute=0, second=0, microsecond=0)
        month = day.replace(day=1)
        next_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        last_month = (month - timedelta(days=1)).replace(day=1)
        with self._lock:
            result = {
                'home_day': self._period('home', day, day + timedelta(days=1), now),
                'solar_day': self._period('solar', day, day + timedelta(days=1), now),
                'home_month': self._period('home', month, next_month, now),
                'home_last_month': self._period('home', last_month, month, now),
            }
            reset = self.db.execute("SELECT baseline, reset_at FROM energy_resets WHERE month=?", (month.date().isoformat(),)).fetchone()
            result['home_counter'] = {'kwh': None if result['home_month']['kwh'] is None else max(0, result['home_month']['kwh'] - (reset['baseline'] if reset else 0)), 'reset_at': reset['reset_at'] if reset else None}
            billing = self.config.billing_day
            if billing is None:
                result['grid_billing'] = None
            else:
                start = month.replace(day=min(billing, calendar.monthrange(month.year, month.month)[1]))
                if local < start:
                    start = last_month.replace(day=min(billing, calendar.monthrange(last_month.year, last_month.month)[1]))
                following = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
                end = following.replace(day=min(billing, calendar.monthrange(following.year, following.month)[1]))
                result['grid_billing'] = self._period('grid_import', start, end, now)
                result['grid_export_billing'] = self._period('grid_export', start, end, now)
            return result

    def reset_home(self, now=None):
        now = now or datetime.now(timezone.utc)
        with self._lock, self.db:
            month = now.astimezone(self.zone).replace(day=1).date().isoformat()
            total = self.summary(now)['home_month']['kwh'] or 0
            self.db.execute("INSERT OR REPLACE INTO energy_resets VALUES (?, ?, ?)", (month, total, now.isoformat()))
        return self.summary(now)
