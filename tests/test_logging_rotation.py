import logging

from deye_monitor.logging_config import create_rotating_handler


def test_rotating_handler_bounds_log_files(tmp_path):
    path = tmp_path / "logs" / "monitor.log"
    handler = create_rotating_handler(path, max_bytes=45, backup_count=2)
    logger = logging.getLogger(f"rotation-test-{id(handler)}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    try:
        for index in range(8):
            logger.info("sample %02d payload", index)
    finally:
        logger.removeHandler(handler)
        handler.close()

    assert path.exists()
    assert path.with_name("monitor.log.1").exists()
    assert path.with_name("monitor.log.2").exists()
    assert not path.with_name("monitor.log.3").exists()
    assert all(file.stat().st_size <= 45 for file in path.parent.iterdir())
