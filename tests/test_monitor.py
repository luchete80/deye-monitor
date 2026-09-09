from datetime import datetime, timedelta, timezone
import json
import pytest

from deye_monitor.adapter import SG03LP1Adapter, parse_payload, parse_status
from deye_monitor.app import create_app
from deye_monitor.config import Config
from deye_monitor.mqtt_client import MQTTClient
from deye_monitor.simulator import FixtureSimulator
from deye_monitor.state import StateStore


def config(**kwargs):
    base = dict(
        host="127.0.0.1", port=5000, data_source="simulated", mqtt_host="x",
        mqtt_port=1883, mqtt_username=None, mqtt_password=None, mqtt_prefix="deye",
        mqtt_keepalive=30, stale_after_seconds=10,
        fresh_required_fields=("solar.pv1_power_w", "solar.pv2_power_w"),
        fixture="fixtures/pv_production.json", simulated_interval_seconds=.001,
        topics={"solar.pv1_power_w": "dc/pv1/power", "solar.pv2_power_w": "dc/pv2/power",
                "connectivity.service": "status", "connectivity.logger": "logger_status"},
        grid_power_sign="unknown", battery_power_sign="unknown",
    )
    base.update(kwargs)
    return Config(**base)


def test_payload_status_parsing_and_unknown_status_is_ignored():
    assert parse_payload(b"12.5") == 12.5
    assert parse_payload(b"nan") is None
    assert parse_payload(b"bad") is None
    assert parse_status(b"connected") == "online"
    assert parse_status(b"offline") == "offline"
    assert parse_status(b"perhaps") is None
    adapter = SG03LP1Adapter("deye", {"solar.pv1_power_w": "dc/pv1/power", "connectivity.service": "status"})
    assert adapter.adapt("deye/dc/pv1/power", b"8") == ("solar.pv1_power_w", 8.0)
    assert adapter.adapt("deye/status", b"perhaps") is None


def test_total_solar_requires_both_inputs_and_has_timestamp():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    store = StateStore(10, ("solar.pv1_power_w", "solar.pv2_power_w"), clock=lambda: now)
    store.update("solar.pv1_power_w", 100)
    partial = store.snapshot()
    assert partial["solar"]["total_power_w"] is None
    assert partial["field_timestamps"]["solar"]["total_power_w"] is None
    assert partial["connectivity"]["stale"] is True
    store.update("solar.pv2_power_w", 50)
    complete = store.snapshot()
    assert complete["solar"]["total_power_w"] == 150
    assert complete["field_freshness"]["solar"]["total_power_w"] is True


def test_required_freshness_cannot_be_hidden_by_other_field_updates():
    current = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    store = StateStore(5, ("solar.pv1_power_w", "solar.pv2_power_w"), clock=lambda: current[0])
    store.update("solar.pv1_power_w", 1)
    store.update("solar.pv2_power_w", 2)
    assert store.snapshot()["connectivity"]["stale"] is False
    current[0] += timedelta(seconds=6)
    store.update("grid.voltage_v", 230)
    state = store.snapshot()
    assert state["field_freshness"]["grid"]["voltage_v"] is True
    assert state["field_freshness"]["solar"]["pv1_power_w"] is False
    assert state["connectivity"]["stale"] is True


def test_broker_service_logger_transitions_are_separate():
    store = StateStore(5, ("solar.pv1_power_w",))
    store.set_broker(True)
    store.update("connectivity.service", "online")
    store.update("connectivity.logger", "offline")
    assert store.snapshot()["connectivity"] | {"stale": True} == {
        "broker": "connected", "service": "online", "logger": "offline", "stale": True
    }
    store.set_broker(False)
    assert store.snapshot()["connectivity"]["broker"] == "disconnected"


def test_configured_power_signs_are_explicit_and_unknown_is_not_published():
    topics = {"grid.power_w": "ac/grid", "battery.power_w": "battery/power"}
    unknown = SG03LP1Adapter("deye", topics)
    assert unknown.adapt("deye/ac/grid", b"30") is None
    explicit = SG03LP1Adapter("deye", topics, grid_power_sign="export_positive", battery_power_sign="charge_positive")
    assert explicit.adapt("deye/ac/grid", b"30") == ("grid.power_w", -30.0)
    assert explicit.adapt("deye/battery/power", b"30") == ("battery.power_w", 30.0)


def test_invalid_sign_and_data_source_configuration_fail_fast():
    with pytest.raises(ValueError, match="DEYE_GRID_POWER_SIGN"):
        config(grid_power_sign="exprot_positive")
    with pytest.raises(ValueError, match="Invalid battery power sign"):
        SG03LP1Adapter("deye", {}, battery_power_sign="maybe")
    with pytest.raises(ValueError, match="DEYE_DATA_SOURCE"):
        config(data_source="simulate")


def test_data_observed_at_excludes_connectivity_events():
    current = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    store = StateStore(10, ("solar.pv1_power_w",), clock=lambda: current[0])
    store.update("solar.pv1_power_w", 10)
    data_at = store.snapshot()["data_observed_at"]
    current[0] += timedelta(seconds=5)
    store.set_broker(True)
    snapshot = store.snapshot()
    assert snapshot["data_observed_at"] == data_at
    assert snapshot["observed_at"] != data_at


class FakeClient:
    def __init__(self, *args, **kwargs):
        self.calls = []

    def username_pw_set(self, username, password): self.calls.append(("credentials", username, password))
    def connect_async(self, *args): self.calls.append(("connect_async", args))
    def loop_start(self): self.calls.append(("loop_start",))
    def loop_stop(self): self.calls.append(("loop_stop",))
    def disconnect(self): self.calls.append(("disconnect",))
    def subscribe(self, topics): self.calls.append(("subscribe", topics))


def test_mqtt_client_subscribes_only_to_contract_and_transitions():
    c = config(mqtt_username="u", mqtt_password="p")
    adapter = SG03LP1Adapter(c.mqtt_prefix, c.topics)
    store = StateStore(10, c.fresh_required_fields)
    mqtt = MQTTClient(c, adapter, store, client_factory=FakeClient)
    mqtt.start()
    mqtt._on_connect(mqtt.client, None, None, 0)
    subscribed = [call for call in mqtt.client.calls if call[0] == "subscribe"][0][1]
    assert set(topic for topic, _ in subscribed) == set(adapter.subscription_topics)
    assert store.snapshot()["connectivity"]["broker"] == "connected"
    mqtt._on_disconnect(mqtt.client, None, None, 1)
    assert store.snapshot()["connectivity"]["broker"] == "disconnected"
    mqtt.stop()


def test_http_api_sse_and_page():
    app = create_app(config(), start_source=False)
    store = app.config["DEYE_STATE"]
    store.update("solar.pv1_power_w", 42)
    client = app.test_client()
    assert client.get("/").status_code == 200
    assert client.get("/health").json["ok"] is True
    assert client.get("/api/state").json["solar"]["pv1_power_w"] == 42
    assert client.get("/api/state").json["data_observed_at"] is not None
    response = client.get("/events", buffered=False)
    assert response.status_code == 200
    assert b"event: state" in next(response.response)
    response.close()


def test_sse_client_keeps_native_reconnect_enabled():
    script = open("deye_monitor/static/app.js", encoding="utf-8").read()
    assert "new EventSource('/events')" in script
    assert "source.close()" not in script
    assert "data_observed_at" in script
    assert "relativeAge" in script


def test_all_fixtures_and_simulator_without_broker(caplog):
    fixture_names = [
        "initial_no_data.json", "pv_production.json", "fragmented_messages.json",
        "logger_offline.json", "stale_data.json", "grid_import_hypothesis.json",
        "grid_export_hypothesis.json",
    ]
    for name in fixture_names:
        assert "messages" in json.loads(open(f"fixtures/{name}", encoding="utf-8").read())

    base_topics = {
        "solar.pv1_power_w": "dc/pv1/power", "solar.pv2_power_w": "dc/pv2/power",
        "grid.voltage_v": "ac/l1/voltage", "connectivity.service": "status",
        "connectivity.logger": "logger_status",
    }
    initial = FixtureSimulator("fixtures/initial_no_data.json", .001, SG03LP1Adapter("deye", base_topics), StateStore(10))
    initial._run()
    assert initial.state.snapshot()["solar"]["pv1_power_w"] is None
    pv = FixtureSimulator("fixtures/pv_production.json", .001, SG03LP1Adapter("deye", base_topics), StateStore(10))
    pv._run()
    assert pv.state.snapshot()["solar"]["pv2_power_w"] == 950
    fragmented = FixtureSimulator("fixtures/fragmented_messages.json", .001, SG03LP1Adapter("deye", base_topics), StateStore(10))
    fragmented._run()
    assert fragmented.state.snapshot()["solar"]["total_power_w"] == 1900
    logger = FixtureSimulator("fixtures/logger_offline.json", .001, SG03LP1Adapter("deye", base_topics), StateStore(10))
    logger._run()
    assert logger.state.snapshot()["connectivity"]["logger"] == "offline"
    stale = FixtureSimulator("fixtures/stale_data.json", .001, SG03LP1Adapter("deye", base_topics), StateStore(-1))
    stale._run()
    assert stale.state.snapshot()["connectivity"]["stale"] is True

    grid_topics = {"grid.power_w": "ac/grid_power_unvalidated"}
    source = FixtureSimulator("fixtures/grid_import_hypothesis.json", .001,
                             SG03LP1Adapter("deye", grid_topics, grid_power_sign="import_positive"),
                             StateStore(10, ("grid.power_w",)))
    source._run()
    assert source.state.snapshot()["grid"]["power_w"] == 720
    assert source.state.snapshot()["connectivity"]["broker"] == "disconnected"
    export = FixtureSimulator("fixtures/grid_export_hypothesis.json", .001,
                              SG03LP1Adapter("deye", grid_topics, grid_power_sign="import_positive"),
                              StateStore(10, ("grid.power_w",)))
    export._run()
    assert export.state.snapshot()["grid"]["power_w"] == -540

    broken = FixtureSimulator("fixtures/does-not-exist.json", .001, SG03LP1Adapter("deye", {}), StateStore(10))
    broken._run()
    assert "invalid fixture" in caplog.text
