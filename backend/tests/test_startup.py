from __future__ import annotations

import plistlib
import subprocess
from pathlib import Path

import pytest

from backend.app.service import ServiceError
from backend.app.startup import (
    MACOS_AGENT_LABEL,
    WINDOWS_RUN_VALUE,
    StartupService,
)


class FakeWinRegistry:
    HKEY_CURRENT_USER = object()
    KEY_QUERY_VALUE = 0x1
    KEY_SET_VALUE = 0x2
    REG_SZ = 1

    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def OpenKey(self, *_args: object) -> FakeWinRegistry:
        return self

    def CreateKeyEx(self, *_args: object) -> FakeWinRegistry:
        return self

    def QueryValueEx(self, _key: object, name: str) -> tuple[str, int]:
        if name not in self.values:
            raise FileNotFoundError(name)
        return self.values[name], self.REG_SZ

    def SetValueEx(
        self,
        _key: object,
        name: str,
        _reserved: int,
        _value_type: int,
        value: str,
    ) -> None:
        self.values[name] = value

    def DeleteValue(self, _key: object, name: str) -> None:
        del self.values[name]

    def CloseKey(self, _key: object) -> None:
        pass


def packaged_executable(tmp_path: Path, name: str = "CodeBear.exe") -> Path:
    executable = tmp_path / name
    executable.write_bytes(b"test executable")
    return executable


def test_windows_startup_registers_and_removes_current_user_run_value(
    tmp_path: Path,
) -> None:
    executable = packaged_executable(tmp_path)
    registry = FakeWinRegistry()
    startup = StartupService(
        platform_name="win32",
        executable=executable,
        is_frozen=True,
        registry_module=registry,
    )

    assert startup.get_status() == {"supported": True, "enabled": False}
    assert startup.set_enabled(True) == {"supported": True, "enabled": True}
    assert registry.values[WINDOWS_RUN_VALUE] == subprocess.list2cmdline(
        [str(executable.resolve()), "--no-browser"]
    )
    assert startup.set_enabled(False) == {"supported": True, "enabled": False}
    assert WINDOWS_RUN_VALUE not in registry.values


def test_windows_startup_preserves_a_conflicting_run_value(tmp_path: Path) -> None:
    registry = FakeWinRegistry()
    registry.values[WINDOWS_RUN_VALUE] = r"C:\OtherApp\other.exe"
    startup = StartupService(
        platform_name="win32",
        executable=packaged_executable(tmp_path),
        is_frozen=True,
        registry_module=registry,
    )

    with pytest.raises(ServiceError) as error:
        startup.set_enabled(True)

    assert error.value.code == "startup_conflict"
    assert registry.values[WINDOWS_RUN_VALUE] == r"C:\OtherApp\other.exe"


def test_macos_startup_writes_a_login_agent_and_removes_only_its_plist(
    tmp_path: Path,
) -> None:
    executable = packaged_executable(tmp_path, "CodeBear")
    home = tmp_path / "home"
    startup = StartupService(
        platform_name="darwin",
        executable=executable,
        is_frozen=True,
        home=home,
    )

    assert startup.get_status() == {"supported": True, "enabled": False}
    assert startup.set_enabled(True) == {"supported": True, "enabled": True}
    agent_path = home / "Library" / "LaunchAgents" / f"{MACOS_AGENT_LABEL}.plist"
    with agent_path.open("rb") as stream:
        agent = plistlib.load(stream)
    assert agent["Label"] == MACOS_AGENT_LABEL
    assert agent["ProgramArguments"] == [str(executable.resolve()), "--no-browser"]
    assert agent["RunAtLoad"] is True
    assert agent["KeepAlive"] is False

    assert startup.set_enabled(False) == {"supported": True, "enabled": False}
    assert not agent_path.exists()


def test_macos_startup_does_not_overwrite_an_unrelated_agent(tmp_path: Path) -> None:
    executable = packaged_executable(tmp_path, "CodeBear")
    home = tmp_path / "home"
    agent_path = home / "Library" / "LaunchAgents" / f"{MACOS_AGENT_LABEL}.plist"
    agent_path.parent.mkdir(parents=True)
    agent_path.write_bytes(
        plistlib.dumps({"Label": "com.other.application", "RunAtLoad": True})
    )
    startup = StartupService(
        platform_name="darwin",
        executable=executable,
        is_frozen=True,
        home=home,
    )

    with pytest.raises(ServiceError) as error:
        startup.set_enabled(True)

    assert error.value.code == "startup_conflict"
    with agent_path.open("rb") as stream:
        assert plistlib.load(stream)["Label"] == "com.other.application"


def test_startup_is_reported_unsupported_for_dev_and_other_platforms(
    tmp_path: Path,
) -> None:
    executable = packaged_executable(tmp_path)
    dev_service = StartupService(
        platform_name="win32", executable=executable, is_frozen=False
    )
    linux_service = StartupService(
        platform_name="linux", executable=executable, is_frozen=True
    )

    assert dev_service.get_status() == {"supported": False, "enabled": False}
    assert linux_service.get_status() == {"supported": False, "enabled": False}
    with pytest.raises(ServiceError) as error:
        linux_service.set_enabled(True)
    assert error.value.code == "startup_unsupported"
