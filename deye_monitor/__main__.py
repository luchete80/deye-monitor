from .app import create_app
app = create_app()
if __name__ == "__main__":
    config = app.config["DEYE_CONFIG"]
    app.run(host=config.host, port=config.port, threaded=True)
