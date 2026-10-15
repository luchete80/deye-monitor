from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv


DEFAULT_LOG_MAX_BYTES = 10 * 1024 * 1024
DEFAULT_LOG_BACKUPS = 3


def create_rotating_handler(
    path: str | Path,
    max_bytes: int = DEFAULT_LOG_MAX_BYTES,
    backup_count: int = DEFAULT_LOG_BACKUPS,
) -> RotatingFileHandler:
    log_path = Path(path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    return RotatingFileHandler(
        log_path, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8"
    )


def configure_logging() -> None:
    load_dotenv()
    log_path = Path(os.getenv("DEYE_LOG_PATH", "data/deye-monitor.log"))
    try:
        handler = create_rotating_handler(log_path)
    except OSError as error:
        logging.basicConfig(level=logging.INFO, stream=sys.stderr)
        logging.getLogger(__name__).error(
            "No se pudo abrir el log rotativo %s; se usará stderr: %s", log_path, error
        )
        return
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])
