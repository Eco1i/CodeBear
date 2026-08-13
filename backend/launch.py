from __future__ import annotations

import argparse
import copy
import socket
import sys
import threading
import time
import webbrowser
from logging.handlers import RotatingFileHandler

import uvicorn

from .app.config import default_app_data_dir


def wait_and_open_browser(host: str, port: int) -> None:
    url = f"http://{host}:{port}"
    for _ in range(100):
        try:
            with socket.create_connection((host, port), timeout=0.2):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.1)


def build_log_config() -> dict:
    log_root = default_app_data_dir() / "logs"
    log_root.mkdir(parents=True, exist_ok=True)
    config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    config["formatters"]["default"] = {
        "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    }
    config["formatters"]["access"] = {
        "format": '%(asctime)s | %(levelname)s | %(client_addr)s - "%(request_line)s" %(status_code)s',
    }
    config["handlers"]["file"] = {
        "class": f"{RotatingFileHandler.__module__}.{RotatingFileHandler.__name__}",
        "formatter": "default",
        "filename": str(log_root / "server.log"),
        "maxBytes": 2 * 1024 * 1024,
        "backupCount": 3,
        "encoding": "utf-8",
    }
    if getattr(sys, "frozen", False):
        config["loggers"]["uvicorn"]["handlers"] = ["file"]
        config["loggers"]["uvicorn.access"]["handlers"] = ["file"]
    else:
        config["loggers"]["uvicorn"]["handlers"].append("file")
        config["loggers"]["uvicorn.access"]["handlers"].append("file")
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description="启动码熊本机服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    arguments = parser.parse_args()

    if not arguments.no_browser:
        threading.Thread(
            target=wait_and_open_browser,
            args=(arguments.host, arguments.port),
            daemon=True,
        ).start()

    uvicorn.run(
        "backend.app.main:app",
        host=arguments.host,
        port=arguments.port,
        log_config=build_log_config(),
    )


if __name__ == "__main__":
    main()
