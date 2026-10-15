from .app import create_app
from .logging_config import configure_logging

configure_logging()
app = create_app()
if __name__ == "__main__":
    config = app.config["DEYE_CONFIG"]
    app.run(host=config.host, port=config.port, threaded=True)
