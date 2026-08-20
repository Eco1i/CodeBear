from __future__ import annotations

import argparse
import ctypes
import json
import os
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

import pystray
import uvicorn
from PIL import Image, ImageDraw

from backend.instance_lock import SingleInstance
from backend.platform_support import default_data_dir, reveal_directory

if sys.platform == "win32":
    from pystray import _win32 as pystray_win32
    from pystray._util import win32 as pystray_win32_api

    from backend.tray_menu import TrayPopupMenu, enable_high_dpi


APP_HOST = "127.0.0.1"
APP_PORT = 8765
if sys.platform == "win32":
    class CodeBearTrayIcon(pystray_win32.Icon):
        """Use the normal tray icon but replace the shell context menu."""

        def __init__(self, *args: Any, popup_actions: tuple[Any, Any, Any], **kwargs: Any):
            super().__init__(*args, **kwargs)
            self._popup_actions = popup_actions
            self._popup: TrayPopupMenu | None = None

        def _on_notify(self, wparam: int, lparam: int) -> None:
            if lparam == pystray_win32_api.WM_LBUTTONUP:
                self()
            elif lparam == pystray_win32_api.WM_RBUTTONUP:
                if self._popup is not None:
                    self._popup.close()
                self._popup = TrayPopupMenu(self._popup_actions)
                self._popup.show_at_cursor()


def executable_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def configure_portable_data_dir() -> Path:
    override = os.environ.get("MAXIONG_APP_DATA_DIR")
    data_dir = Path(override).expanduser().resolve() if override else default_data_dir(executable_root())
    os.environ["MAXIONG_APP_DATA_DIR"] = str(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def show_message(title: str, message: str, *, error: bool = False) -> None:
    if os.environ.get("MAXIONG_SUPPRESS_DIALOGS") == "1":
        return
    if sys.platform == "win32":
        flags = 0x10 if error else 0x40
        ctypes.windll.user32.MessageBoxW(None, message, title, flags)
        return
    if sys.platform == "darwin":
        style = "critical" if error else "informational"
        script = (
            f"display alert {json.dumps(title, ensure_ascii=False)} "
            f"message {json.dumps(message, ensure_ascii=False)} as {style}"
        )
        subprocess.run(["osascript", "-e", script], check=False)
        return
    print(f"{title}: {message}", file=sys.stderr if error else sys.stdout)


def write_launcher_error(data_dir: Path) -> None:
    try:
        log_dir = data_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        with (log_dir / "launcher.log").open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(f"[{datetime.now().astimezone().isoformat(timespec='seconds')}]\n")
            stream.write(traceback.format_exc())
            stream.write("\n")
    except OSError:
        pass


def create_app_icon(size: int = 256) -> Image.Image:
    source_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    candidates = (
        source_root / "frontend" / "dist" / "codebear-icon-v3.png",
        source_root / "frontend" / "public" / "codebear-icon-v3.png",
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        with Image.open(candidate) as source:
            icon = source.convert("RGBA")
        if icon.size != (size, size):
            icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        return icon

    # Keep the launcher usable even if a development checkout is missing the
    # canonical asset. Release builds always bundle codebear-icon-v3.png.
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    scale = size / 256

    def box(values: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        return tuple(round(value * scale) for value in values)  # type: ignore[return-value]

    blue = "#2878E8"
    navy = "#142F50"
    draw.rounded_rectangle(box((5, 5, 251, 251)), radius=round(56 * scale), fill=blue)
    draw.ellipse(box((49, 38, 111, 100)), fill=navy)
    draw.ellipse(box((145, 38, 207, 100)), fill=navy)
    draw.ellipse(box((61, 50, 99, 88)), fill="white")
    draw.ellipse(box((157, 50, 195, 88)), fill="white")
    draw.rounded_rectangle(box((54, 64, 202, 214)), radius=round(70 * scale), fill=navy)
    draw.rounded_rectangle(box((68, 76, 188, 198)), radius=round(58 * scale), fill="white")
    draw.ellipse(box((94, 119, 106, 131)), fill=navy)
    draw.ellipse(box((150, 119, 162, 131)), fill=navy)
    draw.ellipse(box((116, 139, 140, 157)), fill=navy)
    stroke = max(2, round(6 * scale))
    draw.line((round(128 * scale), round(154 * scale), round(128 * scale), round(170 * scale)), fill=navy, width=stroke)
    draw.arc(box((103, 158, 129, 180)), 5, 135, fill=navy, width=stroke)
    draw.arc(box((127, 158, 153, 180)), 45, 175, fill=navy, width=stroke)
    draw.arc(box((91, 178, 165, 209)), 10, 170, fill="#61A8FF", width=max(2, round(5 * scale)))
    return image


def url_for(port: int) -> str:
    return f"http://{APP_HOST}:{port}"


def wait_until_listening(port: int, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((APP_HOST, port), timeout=0.25):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def open_when_ready(port: int) -> bool:
    if not wait_until_listening(port):
        return False
    webbrowser.open(url_for(port))
    return True


def port_is_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((APP_HOST, port))
        except OSError:
            return False
    return True


def build_server(port: int) -> uvicorn.Server:
    from backend.app.main import app
    from backend.launch import build_log_config

    config = uvicorn.Config(
        app,
        host=APP_HOST,
        port=port,
        log_config=build_log_config(),
    )
    return uvicorn.Server(config)


def run_with_tray(server: uvicorn.Server, port: int, data_dir: Path, open_browser: bool) -> int:
    server_thread = threading.Thread(target=server.run, name="maxiong-server", daemon=False)
    server_thread.start()

    if not wait_until_listening(port):
        server.should_exit = True
        server_thread.join(timeout=3)
        log_path = data_dir / "logs" / "server.log"
        show_message("码熊启动失败", f"本机服务未能在端口 {port} 启动，请查看 {log_path}。", error=True)
        return 1

    if open_browser:
        webbrowser.open(url_for(port))

    def open_app(_: pystray.Icon | None = None, __: Any = None) -> None:
        webbrowser.open(url_for(port))

    def open_updates(_: pystray.Icon | None = None, __: Any = None) -> None:
        webbrowser.open(f"{url_for(port)}?update=1")

    def open_data(_: pystray.Icon | None = None, __: Any = None) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        reveal_directory(data_dir)

    def exit_app(icon: pystray.Icon, _: Any = None) -> None:
        server.should_exit = True
        icon.stop()

    app_icon = create_app_icon(256)
    if sys.platform == "win32":
        icon: pystray.Icon = CodeBearTrayIcon(
            "maxiong",
            app_icon,
            "码熊 · PDM 数据字典工作台",
            menu=pystray.Menu(pystray.MenuItem("打开码熊", open_app, default=True)),
            popup_actions=(lambda: open_app(), lambda: open_data(), lambda: open_updates(), lambda: exit_app(icon)),
        )
    else:
        icon = pystray.Icon(
            "maxiong",
            app_icon,
            "码熊 · PDM 数据字典工作台",
            menu=pystray.Menu(
                pystray.MenuItem("打开码熊", open_app, default=True),
                pystray.MenuItem("打开数据目录", open_data),
                pystray.MenuItem("检查更新", open_updates),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("退出码熊", exit_app),
            ),
        )

    try:
        icon.run()
    except Exception as exc:  # pragma: no cover - depends on the desktop shell
        show_message("码熊托盘启动失败", str(exc), error=True)
        return_code = 1
    else:
        return_code = 0
    finally:
        server.should_exit = True
        server_thread.join(timeout=10)
        if server_thread.is_alive():
            server.force_exit = True
            server_thread.join(timeout=2)
    return return_code


def main() -> int:
    if sys.platform == "win32":
        enable_high_dpi()
    parser = argparse.ArgumentParser(description="启动码熊桌面版")
    parser.add_argument("--port", type=int, default=APP_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--no-tray", action="store_true", help=argparse.SUPPRESS)
    arguments = parser.parse_args()

    data_dir = configure_portable_data_dir()
    instance = SingleInstance(arguments.port, data_dir)
    try:
        if instance.already_exists:
            ready = wait_until_listening(arguments.port)
            if ready and not arguments.no_browser:
                webbrowser.open(url_for(arguments.port))
            elif not ready:
                show_message("码熊", "码熊正在启动，请稍后再试。")
            return 0

        if not port_is_available(arguments.port):
            show_message(
                "码熊启动失败",
                f"端口 {arguments.port} 已被其他程序占用，码熊无法启动。",
                error=True,
            )
            return 1

        server = build_server(arguments.port)
        if arguments.no_tray:
            if not arguments.no_browser:
                threading.Thread(target=open_when_ready, args=(arguments.port,), daemon=True).start()
            server.run()
            return 0
        return run_with_tray(server, arguments.port, data_dir, not arguments.no_browser)
    except Exception as exc:  # pragma: no cover - final desktop error boundary
        write_launcher_error(data_dir)
        show_message("码熊启动失败", str(exc), error=True)
        return 1
    finally:
        instance.close()


if __name__ == "__main__":
    raise SystemExit(main())
