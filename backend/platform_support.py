from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path


PLATFORM_WINDOWS = "windows"
PLATFORM_MACOS = "macos"
PLATFORM_LINUX = "linux"
APP_DATA_DIR_NAME = "CodeBear"


def platform_name(value: str | None = None) -> str:
    current = value or sys.platform
    if current == "win32":
        return PLATFORM_WINDOWS
    if current == "darwin":
        return PLATFORM_MACOS
    return PLATFORM_LINUX


def architecture_name(value: str | None = None) -> str:
    machine = (value or platform.machine()).strip().casefold()
    if machine in {"amd64", "x86_64", "x64"}:
        return "x64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return machine.replace("_", "-") or "unknown"


def release_target(
    *,
    system: str | None = None,
    machine: str | None = None,
) -> str:
    current_platform = platform_name(system)
    current_architecture = architecture_name(machine)
    prefix = {
        PLATFORM_WINDOWS: "win",
        PLATFORM_MACOS: "mac",
        PLATFORM_LINUX: "linux",
    }[current_platform]
    return f"{prefix}-{current_architecture}"


def default_data_dir(
    program_root: Path,
    *,
    system: str | None = None,
    home: Path | None = None,
) -> Path:
    if platform_name(system) == PLATFORM_MACOS:
        user_home = (home or Path.home()).expanduser().resolve()
        return user_home / "Library" / "Application Support" / APP_DATA_DIR_NAME
    return program_root.resolve() / "data"


def reveal_directory(path: Path) -> None:
    target = path.resolve()
    current_platform = platform_name()
    if current_platform == PLATFORM_WINDOWS:
        os.startfile(target)  # type: ignore[attr-defined]
        return
    command = ["open", str(target)] if current_platform == PLATFORM_MACOS else ["xdg-open", str(target)]
    subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
