
#!/usr/bin/env python3

import logging
import signal
import time

from gpiozero import MotionSensor, OutputDevice

# GPIO en numeración BCM
PIR_PIN = 17
RELAY_PIN = 27

# Segundos sin movimiento antes de apagar
OFF_DELAY = 120

# Cambiar a False si el relé se activa con HIGH
RELAY_ACTIVE_LOW = True

# Intervalo de consulta
POLL_INTERVAL = 0.1

running = True


def stop_handler(signum, frame):
    global running
    running = False


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)

    pir = MotionSensor(PIR_PIN)
    relay = OutputDevice(
        RELAY_PIN,
        active_high=not RELAY_ACTIVE_LOW,
        initial_value=False,
    )

    last_motion = None
    screen_on = False

    logging.info("PIR screen controller started")

    try:
        while running:
            now = time.monotonic()

            if pir.motion_detected:
                last_motion = now

                if not screen_on:
                    relay.on()
                    screen_on = True
                    logging.info("Motion detected: screen ON")

            elif screen_on and last_motion is not None:
                if now - last_motion >= OFF_DELAY:
                    relay.off()
                    screen_on = False
                    logging.info("Timeout: screen OFF")

            time.sleep(POLL_INTERVAL)

    finally:
        relay.off()
        pir.close()
        relay.close()
        logging.info("PIR screen controller stopped")


if __name__ == "__main__":
    main()
