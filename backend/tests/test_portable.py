from __future__ import annotations

# pyright: reportMissingImports=false
import subprocess
import sys

from backend import portable


def test_server_command_uses_current_runtime(monkeypatch) -> None:
    monkeypatch.delattr(portable.sys, "frozen", raising=False)
    assert portable.server_command(8765) == [
        sys.executable,
        "-m",
        "backend.portable",
        "--server",
        "--port",
        "8765",
    ]

    monkeypatch.setattr(portable.sys, "frozen", True, raising=False)
    assert portable.server_command(8765) == [
        sys.executable,
        "--server",
        "--port",
        "8765",
    ]


def test_duplicate_launch_reports_startup_status_when_server_is_not_ready(
    monkeypatch, tmp_path
) -> None:
    class ExistingInstance:
        already_exists = True

        def close(self) -> None:
            pass

    shown: list[tuple[object, ...]] = []
    monkeypatch.setattr(portable, "SingleInstance", lambda *_: ExistingInstance())
    monkeypatch.setattr(portable, "configure_portable_data_dir", lambda: tmp_path)
    monkeypatch.setattr(portable, "wait_until_listening", lambda _port: False)
    monkeypatch.setattr(
        portable, "show_message", lambda *args, **kwargs: shown.append(args)
    )
    monkeypatch.setattr(portable.sys, "argv", ["portable"], raising=False)

    assert portable.main() == 0
    assert shown == [
        (
            "码熊已在运行",
            "码熊已有实例在运行，但本机服务暂未就绪。\n"
            "请稍后从通知区域双击码熊图标打开；如果超过 30 秒仍不可用，"
            "请先退出该实例后重新启动。",
        )
    ]


def test_duplicate_launch_opens_the_running_instance(monkeypatch, tmp_path) -> None:
    class ExistingInstance:
        already_exists = True

        def close(self) -> None:
            pass

    opened: list[str] = []
    shown: list[tuple[object, ...]] = []
    monkeypatch.setattr(portable, "SingleInstance", lambda *_: ExistingInstance())
    monkeypatch.setattr(portable, "configure_portable_data_dir", lambda: tmp_path)
    monkeypatch.setattr(portable, "wait_until_listening", lambda _port: True)
    monkeypatch.setattr(portable.webbrowser, "open", opened.append)
    monkeypatch.setattr(
        portable, "show_message", lambda *args, **kwargs: shown.append(args)
    )
    monkeypatch.setattr(portable.sys, "argv", ["portable"], raising=False)

    assert portable.main() == 0
    assert opened == ["http://127.0.0.1:8765"]
    assert shown == []


def test_stop_server_process_requests_graceful_shutdown() -> None:
    process = subprocess.Popen(
        [sys.executable, "-c", "import sys; sys.stdin.readline()"],
        stdin=subprocess.PIPE,
    )
    portable.stop_server_process(process)
    assert process.returncode == 0


def test_stop_server_process_has_a_hard_timeout(monkeypatch) -> None:
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)"],
        stdin=subprocess.PIPE,
    )
    monkeypatch.setattr(portable, "SERVER_SHUTDOWN_TIMEOUT", 0.01)
    portable.stop_server_process(process)
    assert process.poll() is not None
