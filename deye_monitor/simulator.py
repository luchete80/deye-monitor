from __future__ import annotations

import json
import logging
from pathlib import Path
import threading


class FixtureSimulator:
    def __init__(self, fixture: str, interval: float, adapter, state):
        self.fixture, self.interval, self.adapter, self.state = Path(fixture), interval, adapter, state
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.log = logging.getLogger(__name__)

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True, name="deye-fixture-simulator")
        self._thread.start()

    def stop(self): self._stop.set()

    def _run(self):
        try:
            messages = json.loads(self.fixture.read_text())["messages"]
            for message in messages:
                if self._stop.is_set(): break
                for adapted in self.adapter.adapt_many(message["topic"], str(message["payload"])):
                    self.state.update(*adapted)
                self._stop.wait(message.get("delay", self.interval))
        except (OSError, KeyError, TypeError, json.JSONDecodeError):
            self.log.exception("Fixture simulator stopped: invalid fixture")
