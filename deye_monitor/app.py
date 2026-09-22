from __future__ import annotations

import csv
import json
import queue
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
from .adapter import SG03LP1Adapter
from .config import Config
from .mqtt_client import MQTTClient
from .simulator import FixtureSimulator
from .state import StateStore
from .history import HistoryStore, SnapshotRecorder


DUMMY_HISTORY_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _read_dummy_csv(filename: str) -> list[dict[str, str]]:
    with (DUMMY_HISTORY_DIR / filename).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def dummy_power_history(now: datetime | None = None) -> list[dict[str, float | str]]:
    current = now or datetime.now().astimezone()
    samples = []
    for row in _read_dummy_csv("dummy_power_history.csv"):
        source_time = datetime.fromisoformat(row["captured_at"])
        captured_at = current.replace(
            hour=source_time.hour, minute=source_time.minute,
            second=source_time.second, microsecond=0,
        )
        samples.append({
            "captured_at": captured_at.isoformat(),
            "pv_power_w": float(row["pv_power_w"]),
            "grid_power_w": float(row["grid_power_w"]),
            "battery_power_w": float(row["battery_power_w"]),
            "home_power_w": float(row["home_power_w"]),
            "soc_pct": float(row["soc_pct"]),
        })
    return samples


def dummy_temperature_history(now: datetime | None = None) -> list[dict[str, float | str]]:
    rows = _read_dummy_csv("dummy_temperature_history.csv")
    end = (now or datetime.now().astimezone()).replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(hours=max(0, len(rows) - 1))
    return [
        {
            "captured_at": (start + timedelta(hours=index)).isoformat(),
            "ambient_c": float(row["ambient_c"]),
        }
        for index, row in enumerate(rows)
    ]


def event_stream(store: StateStore):
    listener = store.subscribe()
    try:
        yield f"event: state\ndata: {json.dumps(store.snapshot())}\n\n"
        while True:
            try: state = listener.get(timeout=10)
            except queue.Empty: state = store.snapshot()
            yield f"event: state\ndata: {json.dumps(state)}\n\n"
    finally: store.unsubscribe(listener)


def create_app(config: Config | None = None, start_source: bool = True) -> Flask:
    config = config or Config.from_env()
    app = Flask(__name__, static_folder="static")
    state = StateStore(
        config.stale_after_seconds, config.fresh_required_fields,
        config.flow_deadband_w, simulated=config.data_source == "simulated",
    )
    adapter = SG03LP1Adapter(
        config.mqtt_prefix, config.topics, config.grid_power_sign,
        config.battery_power_sign, config.mqtt_absolute_topics,
    )
    history = HistoryStore(config.history_db_path, config.history_retention_hours)
    app.config.update(DEYE_CONFIG=config, DEYE_STATE=state, DEYE_HISTORY=history)
    if start_source:
        source = FixtureSimulator(config.fixture, config.simulated_interval_seconds, adapter, state) if config.data_source == "simulated" else MQTTClient(config, adapter, state)
        source.start(); app.extensions["deye_source"] = source
        recorder = SnapshotRecorder(state, history, config.history_interval_seconds)
        recorder.start(); app.extensions["deye_history_recorder"] = recorder

    @app.get("/")
    def index(): return send_from_directory(Path(app.static_folder), "index.html")
    @app.get("/health")
    def health():
        data = state.snapshot(); return jsonify({"ok": True, "broker": data["connectivity"]["broker"], "stale": data["connectivity"]["stale"]})
    @app.get("/api/state")
    def api_state(): return jsonify(state.snapshot())
    @app.get("/api/history")
    def api_history():
        range_name = request.args.get("range", "24h")
        try:
            return jsonify({"range": range_name, "samples": history.query(range_name)})
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
    @app.get("/api/history/temperature")
    def api_temperature_history():
        range_name = request.args.get("range", "24h")
        try:
            return jsonify({
                "range": range_name,
                "samples": history.query_temperature_series(range_name),
            })
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
    @app.get("/api/demo/history")
    def api_demo_history():
        kind = request.args.get("kind", "power")
        if kind == "power":
            return jsonify({"demo": True, "samples": dummy_power_history()})
        if kind == "temperature":
            return jsonify({"demo": True, "samples": dummy_temperature_history()})
        return jsonify({"error": "kind must be power or temperature"}), 400
    @app.get("/events")
    def events(): return Response(stream_with_context(event_stream(state)), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    return app
