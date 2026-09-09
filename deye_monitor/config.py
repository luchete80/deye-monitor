from __future__ import annotations

from dataclasses import dataclass
import os
from dotenv import load_dotenv


VALID_DATA_SOURCES = {"mqtt", "simulated"}
VALID_GRID_POWER_SIGNS = {"unknown", "import_positive", "export_positive"}
VALID_BATTERY_POWER_SIGNS = {"unknown", "charge_positive", "discharge_positive"}


def _value(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    data_source: str
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    mqtt_prefix: str
    mqtt_keepalive: int
    stale_after_seconds: float
    flow_deadband_w: float
    fresh_required_fields: tuple[str, ...]
    fixture: str
    simulated_interval_seconds: float
    topics: dict[str, str]
    grid_power_sign: str
    battery_power_sign: str

    def __post_init__(self) -> None:
        if self.data_source not in VALID_DATA_SOURCES:
            raise ValueError(
                f"DEYE_DATA_SOURCE must be one of {sorted(VALID_DATA_SOURCES)}, got {self.data_source!r}"
            )
        if self.flow_deadband_w < 0:
            raise ValueError("DEYE_FLOW_DEADBAND_W must be zero or greater")
        self._validate_sign("DEYE_GRID_POWER_SIGN", self.grid_power_sign, VALID_GRID_POWER_SIGNS)
        self._validate_sign("DEYE_BATTERY_POWER_SIGN", self.battery_power_sign, VALID_BATTERY_POWER_SIGNS)

    @staticmethod
    def _validate_sign(name: str, value: str, allowed: set[str]) -> None:
        if value not in allowed:
            raise ValueError(f"{name} must be one of {sorted(allowed)}, got {value!r}")

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        suffixes = {
            "solar.pv1_power_w": _value("DEYE_TOPIC_PV1", "dc/pv1/power"),
            "solar.pv2_power_w": _value("DEYE_TOPIC_PV2", "dc/pv2/power"),
            "grid.voltage_v": _value("DEYE_TOPIC_GRID_VOLTAGE", "ac/l1/voltage"),
            "grid.energy_bought_today_kwh": _value("DEYE_TOPIC_GRID_ENERGY_BOUGHT", "ac/daily_energy_bought"),
            "grid.energy_sold_today_kwh": _value("DEYE_TOPIC_GRID_ENERGY_SOLD", "ac/daily_energy_sold"),
            "inverter.ac_power_w": _value("DEYE_TOPIC_INVERTER_AC_POWER", "ac/total_power"),
            "temperature.radiator_c": _value("DEYE_TOPIC_RADIATOR_TEMP", "radiator_temp"),
            "temperature.ac_c": _value("DEYE_TOPIC_AC_TEMP", "ac/temperature"),
            "connectivity.service": _value("DEYE_TOPIC_SERVICE_STATUS", "status"),
            "connectivity.logger": _value("DEYE_TOPIC_LOGGER_STATUS", "logger_status"),
            "grid.power_w": _value("DEYE_TOPIC_GRID_POWER"),
            "battery.power_w": _value("DEYE_TOPIC_BATTERY_POWER"),
            "battery.soc_pct": _value("DEYE_TOPIC_BATTERY_SOC"),
            "load.total_power_w": _value("DEYE_TOPIC_UPS_LOAD_POWER"),
        }
        return cls(
            host=_value("DEYE_HOST", "127.0.0.1"), port=int(_value("DEYE_PORT", "5000")),
            data_source=_value("DEYE_DATA_SOURCE", "mqtt").lower(),
            mqtt_host=_value("DEYE_MQTT_HOST", "localhost"), mqtt_port=int(_value("DEYE_MQTT_PORT", "1883")),
            mqtt_username=_value("DEYE_MQTT_USERNAME") or None, mqtt_password=_value("DEYE_MQTT_PASSWORD") or None,
            mqtt_prefix=_value("DEYE_MQTT_TOPIC_PREFIX", "deye").strip("/"),
            mqtt_keepalive=int(_value("DEYE_MQTT_KEEPALIVE", "30")),
            stale_after_seconds=float(_value("DEYE_STALE_AFTER_SECONDS", "20")),
            flow_deadband_w=float(_value("DEYE_FLOW_DEADBAND_W", "30")),
            fresh_required_fields=tuple(
                field.strip() for field in _value(
                    "DEYE_FRESH_REQUIRED_FIELDS", "solar.pv1_power_w,solar.pv2_power_w"
                ).split(",") if field.strip()
            ),
            fixture=_value("DEYE_FIXTURE", "fixtures/pv_production.json"),
            simulated_interval_seconds=float(_value("DEYE_SIMULATED_INTERVAL_SECONDS", "1")),
            topics={key: value.strip("/") for key, value in suffixes.items() if value},
            grid_power_sign=_value("DEYE_GRID_POWER_SIGN", "unknown"),
            battery_power_sign=_value("DEYE_BATTERY_POWER_SIGN", "unknown"),
        )
