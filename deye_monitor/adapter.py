from __future__ import annotations

import json
import math


def parse_payload(payload: bytes | str) -> float | None:
    """Accept a numeric scalar or a JSON numeric scalar; reject unknown values."""
    try:
        text = payload.decode("utf-8") if isinstance(payload, bytes) else str(payload)
        value = json.loads(text) if text.strip().startswith(("{", "[", '"')) is False else None
        if value is None:
            value = float(text.strip())
        if isinstance(value, bool):
            return None
        value = float(value)
        return value if math.isfinite(value) else None
    except (UnicodeDecodeError, ValueError, TypeError, json.JSONDecodeError):
        return None


def parse_status(payload: bytes | str) -> str | None:
    text = payload.decode("utf-8", errors="replace") if isinstance(payload, bytes) else str(payload)
    value = text.strip().lower()
    if value in {"online", "connected", "1", "true"}:
        return "online"
    if value in {"offline", "disconnected", "0", "false"}:
        return "offline"
    return None


class SG03LP1Adapter:
    def __init__(self, prefix: str, topics: dict[str, str], grid_power_sign: str = "unknown", battery_power_sign: str = "unknown"):
        self.prefix = prefix.strip("/")
        self.by_topic = {f"{self.prefix}/{suffix}": field for field, suffix in topics.items()}
        self.signs = {"grid.power_w": grid_power_sign, "battery.power_w": battery_power_sign}

    @property
    def subscription_topics(self) -> tuple[str, ...]:
        """Only listen to the configured contract, not the whole publisher tree."""
        return tuple(self.by_topic)

    def adapt(self, topic: str, payload: bytes | str) -> tuple[str, object] | None:
        field = self.by_topic.get(topic.strip("/"))
        if not field:
            return None
        if field in {"connectivity.service", "connectivity.logger"}:
            status = parse_status(payload)
            return (field, status) if status is not None else None
        value = parse_payload(payload)
        if value is None:
            return None
        # A configured power source remains unknown until its sign convention is explicit.
        sign = self.signs.get(field)
        if sign == "export_positive" or sign == "discharge_positive":
            value = -value
        if sign == "unknown":
            return None
        return field, value
