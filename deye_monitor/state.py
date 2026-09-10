from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import queue
import threading


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class StateStore:
    def __init__(self, stale_after_seconds: float, required_fresh_fields: tuple[str, ...] = (), flow_deadband_w: float = 30, simulated: bool = False, clock=utcnow):
        self.clock, self.stale_after_seconds, self.flow_deadband_w, self.simulated = clock, stale_after_seconds, flow_deadband_w, simulated
        self.required_fresh_fields = required_fresh_fields
        self._lock = threading.Lock()
        self._listeners: list[queue.Queue] = []
        self._values = {
            "solar": {
                "pv1_power_w": None, "pv2_power_w": None, "total_power_w": None,
                "pv1_current_a": None, "pv2_current_a": None,
            },
            "battery": {"soc_pct": None, "power_w": None, "current_a": None},
            "grid": {
                "voltage_v": None, "power_w": None, "estimated_current_a": None,
                "energy_bought_today_kwh": None, "energy_sold_today_kwh": None,
            },
            "load": {"total_power_w": None, "current_a": None},
            "inverter": {"ac_power_w": None},
            "temperature": {"radiator_c": None, "ac_c": None},
        }
        self._timestamps = {group: {key: None for key in fields} for group, fields in self._values.items()}
        self._connectivity = {"broker": "disconnected", "service": "unknown", "logger": "unknown"}
        self._observed_at: datetime | None = None
        self._data_observed_at: datetime | None = None

    def update(self, dotted: str, value: object, received_at: datetime | None = None) -> None:
        received_at = received_at or self.clock()
        group, field = dotted.split(".", 1)
        with self._lock:
            if group == "connectivity":
                self._connectivity[field] = value
            else:
                self._values[group][field] = value
                self._timestamps[group][field] = received_at
                self._data_observed_at = received_at
            self._observed_at = received_at
        self._notify()

    def set_broker(self, connected: bool) -> None:
        self.update("connectivity.broker", "connected" if connected else "disconnected")

    def snapshot(self, now: datetime | None = None) -> dict:
        now = now or self.clock()
        with self._lock:
            result = deepcopy(self._values)
            timestamps = deepcopy(self._timestamps)
            pv1_at = timestamps["solar"]["pv1_power_w"]
            pv2_at = timestamps["solar"]["pv2_power_w"]
            result["solar"]["total_power_w"] = self._sum_known(result["solar"]["pv1_power_w"], result["solar"]["pv2_power_w"])
            timestamps["solar"]["total_power_w"] = min(pv1_at, pv2_at) if result["solar"]["total_power_w"] is not None else None
            freshness = {
                group: {
                    field: timestamp is not None and (now - timestamp).total_seconds() <= self.stale_after_seconds
                    for field, timestamp in fields.items()
                }
                for group, fields in timestamps.items()
            }
            # No validated grid-current topic is available for this inverter.
            # Expose an estimate only while both source measurements are fresh.
            grid_power = result["grid"]["power_w"]
            grid_voltage = result["grid"]["voltage_v"]
            power_fresh = freshness["grid"]["power_w"]
            voltage_fresh = freshness["grid"]["voltage_v"]
            if (
                isinstance(grid_power, (int, float)) and not isinstance(grid_power, bool)
                and isinstance(grid_voltage, (int, float)) and not isinstance(grid_voltage, bool)
                and grid_voltage != 0 and power_fresh and voltage_fresh
            ):
                result["grid"]["estimated_current_a"] = abs(grid_power) / abs(grid_voltage)
                source_times = [timestamps["grid"][field] for field in ("power_w", "voltage_v")]
                timestamps["grid"]["estimated_current_a"] = max(source_times)
                freshness["grid"]["estimated_current_a"] = True
            else:
                result["grid"]["estimated_current_a"] = None
                timestamps["grid"]["estimated_current_a"] = None
                freshness["grid"]["estimated_current_a"] = False
            required = [self._field_fresh(freshness, field) for field in self.required_fresh_fields]
            # No configured requirement means no data freshness claim can be made.
            globally_fresh = bool(required) and all(required)
            result["connectivity"] = {**self._connectivity, "stale": not globally_fresh}
            result["observed_at"] = iso(self._observed_at)
            result["data_observed_at"] = iso(self._data_observed_at)
            result["flow"] = {"deadband_w": self.flow_deadband_w, "simulated": self.simulated}
            result["field_timestamps"] = {g: {k: iso(v) for k, v in fields.items()} for g, fields in timestamps.items()}
            result["field_freshness"] = freshness
            return result

    @staticmethod
    def _sum_known(a: float | None, b: float | None) -> float | None:
        return None if a is None or b is None else a + b

    @staticmethod
    def _field_fresh(freshness: dict, dotted: str) -> bool:
        group, _, field = dotted.partition(".")
        return freshness.get(group, {}).get(field, False)

    def subscribe(self) -> queue.Queue:
        listener: queue.Queue = queue.Queue(maxsize=10)
        with self._lock: self._listeners.append(listener)
        return listener

    def unsubscribe(self, listener: queue.Queue) -> None:
        with self._lock:
            if listener in self._listeners: self._listeners.remove(listener)

    def _notify(self) -> None:
        snapshot = self.snapshot()
        with self._lock: listeners = list(self._listeners)
        for listener in listeners:
            try: listener.put_nowait(snapshot)
            except queue.Full: pass
