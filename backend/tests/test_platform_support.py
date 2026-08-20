import socket
from pathlib import Path

from backend.instance_lock import SingleInstance
from backend.platform_support import (
    architecture_name,
    default_data_dir,
    platform_name,
    release_target,
)


def test_platform_and_architecture_names_are_stable() -> None:
    assert platform_name("win32") == "windows"
    assert platform_name("darwin") == "macos"
    assert platform_name("linux") == "linux"
    assert architecture_name("AMD64") == "x64"
    assert architecture_name("x86_64") == "x64"
    assert architecture_name("arm64") == "arm64"
    assert release_target(system="darwin", machine="arm64") == "mac-arm64"
    assert release_target(system="win32", machine="AMD64") == "win-x64"


def test_default_data_dir_uses_application_support_on_macos(tmp_path: Path) -> None:
    program_root = tmp_path / "CodeBear.app" / "Contents" / "MacOS"
    home = tmp_path / "home"

    assert default_data_dir(program_root, system="darwin", home=home) == (
        home / "Library" / "Application Support" / "CodeBear"
    )
    assert default_data_dir(program_root, system="win32", home=home) == program_root / "data"


def test_single_instance_rejects_second_owner(tmp_path: Path) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = int(probe.getsockname()[1])

    first = SingleInstance(port, tmp_path)
    second = SingleInstance(port, tmp_path)
    try:
        assert first.already_exists is False
        assert second.already_exists is True
    finally:
        second.close()
        first.close()
