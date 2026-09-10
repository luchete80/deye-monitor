from __future__ import annotations

import logging
from uuid import uuid4
import paho.mqtt.client as mqtt


class MQTTClient:
    """Thin paho boundary: callbacks only adapt and update the thread-safe store."""
    def __init__(self, config, adapter, state, client_factory=mqtt.Client):
        self.config, self.adapter, self.state = config, adapter, state
        self.log = logging.getLogger(__name__)
        self.client = client_factory(
            mqtt.CallbackAPIVersion.VERSION2, client_id=f"deye-monitor-{uuid4().hex[:12]}"
        )
        if config.mqtt_username: self.client.username_pw_set(config.mqtt_username, config.mqtt_password)
        self.client.on_connect, self.client.on_disconnect, self.client.on_message = self._on_connect, self._on_disconnect, self._on_message

    def start(self):
        self.client.connect_async(self.config.mqtt_host, self.config.mqtt_port, self.config.mqtt_keepalive)
        self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            self.state.set_broker(True)
            client.subscribe([(topic, 1) for topic in self.adapter.subscription_topics])
        else:
            self.state.set_broker(False)
            self.log.warning("MQTT connection refused: %s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self.state.set_broker(False)
        self.log.warning("MQTT disconnected: %s", reason_code)

    def _on_message(self, client, userdata, message):
        try:
            for adapted in self.adapter.adapt_many(message.topic, message.payload):
                self.state.update(*adapted)
        except Exception:
            self.log.exception("Ignoring MQTT callback failure")
