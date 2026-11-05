#!/bin/bash
# Ejemplo local con batería al 65% y descarga de 2400 W.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1
export DEYE_DATA_SOURCE=simulated
export DEYE_FIXTURE=fixtures/battery_dashboard.json
export DEYE_MQTT_PREFIX=deye
export DEYE_TOPIC_BATTERY_SOC=battery/soc
export DEYE_TOPIC_BATTERY_POWER=battery/power
export DEYE_BATTERY_POWER_SIGN=discharge_positive
export DEYE_BATTERY_USABLE_KWH=7
export DEYE_BATTERY_SOC_MIN_PCT=25
export DEYE_BATTERY_SOC_MAX_PCT=95
export DEYE_HISTORY_DB_PATH=data/demo.sqlite3
exec .venv/bin/python -m deye_monitor
