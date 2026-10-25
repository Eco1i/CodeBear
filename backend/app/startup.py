from __future__ import annotations

import os
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from .service import ServiceError

WINDOWS_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_RUN_VALUE = "CodeBear"
MACOS_AGENT_LABEL = "com.eco1i.codebear.login"


class StartupService:
    """Manage current-user login startup for packaged desktop builds."""

    def __init__(
        self,
        *,
        platform_name: str | None = None,
        executable: str | Path | None = None,
        is_frozen: bool | None = None,
        home: Path | None = None,
        registry_module: Any | None = None,
    ) -> None:
        self.platform_name = platform_name or sys.platform
        self.executable = Path(executable or sys.executable).expanduser().resolve()
        self.is_frozen = (
            bool(getattr(sys, "frozen", False)) if is_frozen is None else is_frozen
        )
        self.home = (home or Path.home()).expanduser().resolve()
        self.registry_module = registry_module

    @property
    def supported(self) -> bool:
        return (
            self.is_frozen
            and self.executable.is_file()
            and self.platform_name in {"win32", "darwin"}
        )

    def get_status(self) -> dict[str, bool]:
        if not self.supported:
            return {"supported": False, "enabled": False}
        try:
            enabled = (
                self._windows_enabled()
                if self.platform_name == "win32"
                else self._macos_enabled()
            )
        except ServiceError:
            raise
        except (OSError, ImportError, plistlib.InvalidFileException) as exc:
            raise ServiceError(
                500,
                "读取登录启动设置失败",
                code="startup_settings_error",
            ) from exc
        return {"supported": True, "enabled": enabled}

    def set_enabled(self, enabled: bool) -> dict[str, bool]:
        if not self.supported:
            raise ServiceError(
                409,
                "登录时启动仅支持 Windows 和 macOS 桌面版",
                code="startup_unsupported",
            )
        try:
            if self.platform_name == "win32":
                self._set_windows_enabled(enabled)
            else:
                self._set_macos_enabled(enabled)
        except ServiceError:
            raise
        except (OSError, ImportError, plistlib.InvalidFileException) as exc:
            raise ServiceError(
                500,
                "保存登录启动设置失败，请检查当前账户权限",
                code="startup_settings_error",
            ) from exc
        return self.get_status()

    def _windows_registry(self) -> Any:
        if self.registry_module is not None:
            return self.registry_module
        import winreg

        return winreg

    @staticmethod
    def _is_codebear_command(value: str) -> bool:
        return "codebear" in value.casefold()

    def _windows_command(self) -> str:
        return subprocess.list2cmdline([str(self.executable), "--no-browser"])

    def _read_windows_command(self, registry: Any) -> str | None:
        try:
            key = registry.OpenKey(
                registry.HKEY_CURRENT_USER,
                WINDOWS_RUN_KEY,
                0,
                registry.KEY_QUERY_VALUE,
            )
        except FileNotFoundError:
            return None
        try:
            try:
                value, _ = registry.QueryValueEx(key, WINDOWS_RUN_VALUE)
            except FileNotFoundError:
                return None
            return value if isinstance(value, str) else None
        finally:
            registry.CloseKey(key)

    def _windows_enabled(self) -> bool:
        return (
            self._read_windows_command(self._windows_registry())
            == self._windows_command()
        )

    def _set_windows_enabled(self, enabled: bool) -> None:
        registry = self._windows_registry()
        if not enabled:
            try:
                key = registry.OpenKey(
                    registry.HKEY_CURRENT_USER,
                    WINDOWS_RUN_KEY,
                    0,
                    registry.KEY_QUERY_VALUE | registry.KEY_SET_VALUE,
                )
            except FileNotFoundError:
                return
            try:
                try:
                    current, _ = registry.QueryValueEx(key, WINDOWS_RUN_VALUE)
                except FileNotFoundError:
                    return
                if not isinstance(current, str) or not self._is_codebear_command(
                    current
                ):
                    raise ServiceError(
                        409,
                        "检测到同名的登录启动项，未修改原有配置",
                        code="startup_conflict",
                    )
                registry.DeleteValue(key, WINDOWS_RUN_VALUE)
            finally:
                registry.CloseKey(key)
            return

        key = registry.CreateKeyEx(
            registry.HKEY_CURRENT_USER,
            WINDOWS_RUN_KEY,
            0,
            registry.KEY_QUERY_VALUE | registry.KEY_SET_VALUE,
        )
        try:
            try:
                current, _ = registry.QueryValueEx(key, WINDOWS_RUN_VALUE)
            except FileNotFoundError:
                current = None
            if (
                current is not None
                and current != self._windows_command()
                and (
                    not isinstance(current, str)
                    or not self._is_codebear_command(current)
                )
            ):
                raise ServiceError(
                    409,
                    "检测到同名的登录启动项，未修改原有配置",
                    code="startup_conflict",
                )
            registry.SetValueEx(
                key,
                WINDOWS_RUN_VALUE,
                0,
                registry.REG_SZ,
                self._windows_command(),
            )
        finally:
            registry.CloseKey(key)

    @property
    def _macos_agent_path(self) -> Path:
        return self.home / "Library" / "LaunchAgents" / f"{MACOS_AGENT_LABEL}.plist"

    def _macos_arguments(self) -> list[str]:
        return [str(self.executable), "--no-browser"]

    def _read_macos_agent(self) -> dict[str, Any] | None:
        try:
            with self._macos_agent_path.open("rb") as stream:
                payload = plistlib.load(stream)
        except FileNotFoundError:
            return None
        except plistlib.InvalidFileException:
            return None
        return payload if isinstance(payload, dict) else None

    def _macos_enabled(self) -> bool:
        payload = self._read_macos_agent()
        return bool(
            payload
            and payload.get("Label") == MACOS_AGENT_LABEL
            and payload.get("ProgramArguments") == self._macos_arguments()
            and isinstance(payload.get("RunAtLoad"), bool)
            and payload["RunAtLoad"]
        )

    def _set_macos_enabled(self, enabled: bool) -> None:
        path = self._macos_agent_path
        payload = self._read_macos_agent()
        if payload and payload.get("Label") not in {None, MACOS_AGENT_LABEL}:
            raise ServiceError(
                409,
                "检测到同名的登录启动项，未修改原有配置",
                code="startup_conflict",
            )
        if not enabled:
            if path.exists():
                path.unlink()
            return

        launch_agents = path.parent
        if not launch_agents.resolve().is_relative_to(self.home):
            raise ServiceError(
                409,
                "登录启动配置目录不安全，未写入配置",
                code="startup_settings_error",
            )
        launch_agents.mkdir(parents=True, exist_ok=True)
        agent = {
            "Label": MACOS_AGENT_LABEL,
            "ProgramArguments": self._macos_arguments(),
            "RunAtLoad": True,
            "KeepAlive": False,
        }
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                prefix=".codebear-login-",
                suffix=".tmp",
                dir=launch_agents,
                delete=False,
            ) as stream:
                temporary_path = Path(stream.name)
                stream.write(
                    plistlib.dumps(agent, fmt=plistlib.FMT_XML, sort_keys=True)
                )
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, path)
        finally:
            if temporary_path is not None and temporary_path.exists():
                temporary_path.unlink()
