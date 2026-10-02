from __future__ import annotations

from dataclasses import dataclass, field
import math
import os
from dotenv import load_dotenv
from zoneinfo import ZoneInfo


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
    history_db_path: str = "data/deye-monitor.sqlite3"
    history_interval_seconds: float = 5
    history_retention_hours: float = 24
    mqtt_absolute_topics: dict[str, str] = field(default_factory=dict)

    gauge_solar_max_w: float | None = None
    gauge_grid_max_w: float = 6000
    gauge_load_max_w: float = 6000
    home_day_scale_kwh: float = 6
    home_day_scale_next_kwh: float = 12
    solar_capacity_w: float = 6000
    battery_usable_kwh: float | None = None
    battery_soc_min_pct: float = 25
    battery_soc_max_pct: float = 95
    billing_day: int | None = None
    timezone: str = "America/Argentina/Buenos_Aires"
    grid_absent_below_v: float = 10
    alert_beep_enabled: bool = False

    def public_dashboard(self) -> dict:
        return {
            "gauge_max_w": {"solar": self.gauge_solar_max_w or self.solar_capacity_w,
                            "grid": self.gauge_grid_max_w, "load": self.gauge_load_max_w},
            "home_day_scale_kwh": self.home_day_scale_kwh,
            "home_day_scale_next_kwh": self.home_day_scale_next_kwh,
            "solar_capacity_w": self.solar_capacity_w,
            "battery_usable_kwh": self.battery_usable_kwh,
            "soc_min": self.battery_soc_min_pct, "soc_max": self.battery_soc_max_pct,
            "billing_day": self.billing_day, "timezone": self.timezone,
            "grid_absent_below_v": self.grid_absent_below_v,
            "beep_enabled": self.alert_beep_enabled,
        }

    def __post_init__(self) -> None:
        for name in ("gauge_solar_max_w", "gauge_grid_max_w", "gauge_load_max_w",
                     "home_day_scale_kwh", "home_day_scale_next_kwh", "solar_capacity_w", "battery_usable_kwh"):
            value = getattr(self, name)
            if value is not None and (not math.isfinite(value) or value <= 0):
                raise ValueError(f"{name} must be finite and positive")
        if not 0 <= self.battery_soc_min_pct < self.battery_soc_max_pct <= 100:
            raise ValueError("Battery SOC requires 0 <= minimum < maximum <= 100")
        if self.home_day_scale_next_kwh <= self.home_day_scale_kwh:
            raise ValueError("Next home scale must exceed initial scale")
        if self.billing_day is not None and not 1 <= self.billing_day <= 31:
            raise ValueError("Billing day must be between 1 and 31")
        if not math.isfinite(self.grid_absent_below_v) or self.grid_absent_below_v < 0:
            raise ValueError("Grid absence threshold must be finite and nonnegative")
        ZoneInfo(self.timezone)
        if self.data_source not in VALID_DATA_SOURCES:
            raise ValueError(
                f"DEYE_DATA_SOURCE must be one of {sorted(VALID_DATA_SOURCES)}, got {self.data_source!r}"
            )
        if not math.isfinite(self.flow_deadband_w) or self.flow_deadband_w < 0:
            raise ValueError("DEYE_FLOW_DEADBAND_W must be a finite value equal to or greater than zero")
        if not math.isfinite(self.history_interval_seconds) or self.history_interval_seconds <= 0:
            raise ValueError("DEYE_HISTORY_INTERVAL_SECONDS must be a finite value greater than zero")
        if not math.isfinite(self.history_retention_hours) or self.history_retention_hours <= 0:
            raise ValueError("DEYE_HISTORY_RETENTION_HOURS must be a finite value greater than zero")
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
            "solar.pv1_current_a": _value("DEYE_TOPIC_PV1_CURRENT", "dc/pv1/current"),
            "solar.pv2_current_a": _value("DEYE_TOPIC_PV2_CURRENT", "dc/pv2/current"),
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
            "battery.current_a": _value("DEYE_TOPIC_BATTERY_CURRENT", "battery/current"),
            "battery.soc_pct": _value("DEYE_TOPIC_BATTERY_SOC"),
            "load.total_power_w": _value("DEYE_TOPIC_UPS_LOAD_POWER"),
            "load.current_a": _value("DEYE_TOPIC_LOAD_CURRENT", "ac/l1/current"),
        }
        return cls(
            gauge_solar_max_w=float(_value("DEYE_GAUGE_SOLAR_MAX_W")) if _value("DEYE_GAUGE_SOLAR_MAX_W") else None,
            gauge_grid_max_w=float(_value("DEYE_GAUGE_GRID_MAX_W", "6000")),
            gauge_load_max_w=float(_value("DEYE_GAUGE_LOAD_MAX_W", "6000")),
            home_day_scale_kwh=float(_value("DEYE_HOME_DAY_SCALE_KWH", "6")),
            home_day_scale_next_kwh=float(_value("DEYE_HOME_DAY_SCALE_NEXT_KWH", "12")),
            solar_capacity_w=float(_value("DEYE_SOLAR_CAPACITY_W", "6000")),
            battery_usable_kwh=float(_value("DEYE_BATTERY_USABLE_KWH")) if _value("DEYE_BATTERY_USABLE_KWH") else None,
            battery_soc_min_pct=float(_value("DEYE_BATTERY_SOC_MIN_PCT", "25")),
            battery_soc_max_pct=float(_value("DEYE_BATTERY_SOC_MAX_PCT", "95")),
            billing_day=int(_value("DEYE_BILLING_DAY")) if _value("DEYE_BILLING_DAY") else None,
            timezone=_value("DEYE_TIMEZONE", "America/Argentina/Buenos_Aires"),
            grid_absent_below_v=float(_value("DEYE_GRID_ABSENT_BELOW_V", "10")),
            alert_beep_enabled=_value("DEYE_ALERT_BEEP_ENABLED", "false").lower() == "true",
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
            history_db_path=_value("DEYE_HISTORY_DB_PATH", "data/deye-monitor.sqlite3"),
            history_interval_seconds=float(_value("DEYE_HISTORY_INTERVAL_SECONDS", "5")),
            history_retention_hours=float(_value("DEYE_HISTORY_RETENTION_HOURS", "24")),
            mqtt_absolute_topics={
                key: topic for key, topic in {
                    "temperature.ambient_c": _value("DEYE_TOPIC_AMBIENT_TEMPERATURE", "nodemcu/temperatura"),
                    "temperature.ambient2_c": _value("DEYE_TOPIC_AMBIENT_TEMPERATURE2", "nodemcu/temperatura2"),
                }.items() if topic
            },
        )
