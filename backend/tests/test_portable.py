from __future__ import annotations

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
