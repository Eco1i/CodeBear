from __future__ import annotations

import base64
import ctypes
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any

from ctypes import wintypes


APP_NAME = "码熊"
APP_VERSION = "1.2.1"
INTERNAL_DIR_NAMES = {".码熊回收站", ".码熊备份"}
AI_PROVIDER = "deepseek"
AI_MODEL = "deepseek-v4-flash"
AI_BASE_URL = "https://api.deepseek.com"
AI_KEY_ENVIRONMENT_VARIABLE = "DEEPSEEK_API_KEY"
DEFAULT_AI_ASSISTANT_NAME = "小码"
DEFAULT_AI_ASSISTANT_ACCESSORY = "none"
AI_ASSISTANT_ACCESSORIES = frozenset({
    "none",
    "blue_scarf",
    "red_cap",
    "knit_hat",
    "round_glasses",
    "headphones",
    "bow_tie",
    "data_crown",
})


class SecretProtectionError(RuntimeError):
    pass


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _windows_dpapi(data: bytes, *, protect: bool) -> bytes:
    if sys.platform != "win32":
        raise SecretProtectionError("当前系统不支持 Windows DPAPI，无法安全保存 API Key")

    input_buffer = ctypes.create_string_buffer(data)
    input_blob = _DataBlob(
        len(data),
        ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    output_blob = _DataBlob()
    crypt32 = ctypes.WinDLL("Crypt32.dll", use_last_error=True)
    kernel32 = ctypes.WinDLL("Kernel32.dll", use_last_error=True)
    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(_DataBlob),
        wintypes.LPCWSTR,
        ctypes.POINTER(_DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(_DataBlob),
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(_DataBlob),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.POINTER(_DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(_DataBlob),
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p

    flags = 0x01  # CRYPTPROTECT_UI_FORBIDDEN
    if protect:
        succeeded = crypt32.CryptProtectData(
            ctypes.byref(input_blob),
            "码熊 DeepSeek API Key",
            None,
            None,
            None,
            flags,
            ctypes.byref(output_blob),
        )
    else:
        succeeded = crypt32.CryptUnprotectData(
            ctypes.byref(input_blob),
            None,
            None,
            None,
            None,
            flags,
            ctypes.byref(output_blob),
        )
    if not succeeded:
        raise SecretProtectionError(f"Windows DPAPI 操作失败（{ctypes.get_last_error()}）")
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        kernel32.LocalFree(ctypes.cast(output_blob.pbData, ctypes.c_void_p))


def protect_secret(value: str) -> str:
    encrypted = _windows_dpapi(value.encode("utf-8"), protect=True)
    return "dpapi:v1:" + base64.b64encode(encrypted).decode("ascii")


def unprotect_secret(value: str) -> str:
    prefix = "dpapi:v1:"
    if not value.startswith(prefix):
        raise SecretProtectionError("API Key 的本机加密格式无效")
    try:
        encrypted = base64.b64decode(value[len(prefix) :], validate=True)
        return _windows_dpapi(encrypted, protect=False).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise SecretProtectionError("API Key 的本机加密内容已损坏") from exc


def program_root() -> Path:
    """Return the directory that owns the executable or the source checkout."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def bundled_resource(*parts: str) -> Path:
    """Resolve a file bundled by PyInstaller, falling back to the source tree."""
    bundle_root = getattr(sys, "_MEIPASS", None)
    root = Path(bundle_root).resolve() if bundle_root else program_root()
    return root.joinpath(*parts)


def default_app_data_dir() -> Path:
    override = os.environ.get("MAXIONG_APP_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return (program_root() / "data").resolve()


@dataclass(frozen=True)
class AppPaths:
    app_data: Path
    database: Path
    settings: Path

    @classmethod
    def create(cls) -> "AppPaths":
        app_data = default_app_data_dir()
        app_data.mkdir(parents=True, exist_ok=True)
        return cls(
            app_data=app_data,
            database=app_data / "maxiong.db",
            settings=app_data / "settings.json",
        )


class SettingsStore:
    def __init__(self, paths: AppPaths):
        self.paths = paths
        self._lock = RLock()

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.paths.settings.exists():
            return {}
        try:
            payload = json.loads(self.paths.settings.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def _ai_appearance(payload: dict[str, Any]) -> dict[str, str]:
        ai_payload = payload.get("ai")
        stored_name = ai_payload.get("assistant_name") if isinstance(ai_payload, dict) else None
        stored_accessory = (
            ai_payload.get("assistant_accessory") if isinstance(ai_payload, dict) else None
        )
        assistant_name = (
            str(stored_name or DEFAULT_AI_ASSISTANT_NAME).strip()[:20]
            or DEFAULT_AI_ASSISTANT_NAME
        )
        assistant_accessory = str(stored_accessory or DEFAULT_AI_ASSISTANT_ACCESSORY)
        if assistant_accessory not in AI_ASSISTANT_ACCESSORIES:
            assistant_accessory = DEFAULT_AI_ASSISTANT_ACCESSORY
        return {
            "assistant_name": assistant_name,
            "assistant_accessory": assistant_accessory,
        }

    def read(self) -> dict[str, str]:
        with self._lock:
            payload = self._read_unlocked()
            default_workspace = str(self.paths.app_data / "workspace")
            workspace = str(payload.get("workspace_root") or default_workspace)
            result = {
                "workspace_root": str(Path(workspace).expanduser().resolve()),
                **self._ai_appearance(payload),
            }
            Path(result["workspace_root"]).mkdir(parents=True, exist_ok=True)
            if payload.get("workspace_root") != result["workspace_root"]:
                payload["workspace_root"] = result["workspace_root"]
                self._write_unlocked(payload)
            return result

    def update_workspace(self, workspace_root: str) -> dict[str, str]:
        root = Path(workspace_root).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        if not root.is_dir():
            raise ValueError("工作区路径不是文件夹")
        with self._lock:
            payload = self._read_unlocked()
            payload["workspace_root"] = str(root)
            self._write_unlocked(payload)
        return self.read()

    def get_ai_api_key(self) -> str | None:
        environment_key = os.environ.get(AI_KEY_ENVIRONMENT_VARIABLE, "").strip()
        if environment_key:
            return environment_key
        with self._lock:
            payload = self._read_unlocked()
            ai_payload = payload.get("ai")
            if not isinstance(ai_payload, dict):
                return None
            protected_key = str(ai_payload.get("api_key_protected") or "")
            return unprotect_secret(protected_key) if protected_key else None

    def ai_status(self) -> dict[str, Any]:
        source = "none"
        key = os.environ.get(AI_KEY_ENVIRONMENT_VARIABLE, "").strip()
        error = ""
        if key:
            source = "environment"
        else:
            try:
                key = self.get_ai_api_key() or ""
            except SecretProtectionError as exc:
                error = str(exc)
                key = ""
            if key:
                source = "windows_dpapi"
        hint = ""
        if key:
            visible_prefix = key[:3] if len(key) > 7 else key[:1]
            visible_suffix = key[-4:] if len(key) > 7 else key[-1:]
            hint = f"{visible_prefix}••••{visible_suffix}"
        with self._lock:
            payload = self._read_unlocked()
            appearance = self._ai_appearance(payload)
        return {
            "provider": AI_PROVIDER,
            "model": AI_MODEL,
            "base_url": AI_BASE_URL,
            **appearance,
            "configured": bool(key),
            "key_hint": hint,
            "storage": source,
            "error": error,
        }

    def update_ai_settings(
        self,
        *,
        api_key: str | None = None,
        assistant_name: str | None = None,
        assistant_accessory: str | None = None,
    ) -> dict[str, Any]:
        protected: str | None = None
        normalized_name: str | None = None
        normalized_accessory: str | None = None
        if api_key is not None:
            normalized_key = api_key.strip()
            if not normalized_key:
                raise ValueError("API Key 不能为空")
            protected = protect_secret(normalized_key)
        if assistant_name is not None:
            normalized_name = " ".join(assistant_name.split())
            if not normalized_name:
                raise ValueError("助手名称不能为空")
            if len(normalized_name) > 20:
                raise ValueError("助手名称不能超过 20 个字符")
        if assistant_accessory is not None:
            normalized_accessory = assistant_accessory.strip()
            if normalized_accessory not in AI_ASSISTANT_ACCESSORIES:
                raise ValueError("不支持的助手配饰")
        if protected is None and normalized_name is None and normalized_accessory is None:
            return self.ai_status()
        with self._lock:
            payload = self._read_unlocked()
            ai_payload = payload.get("ai")
            if not isinstance(ai_payload, dict):
                ai_payload = {}
            ai_payload.update({"provider": AI_PROVIDER, "model": AI_MODEL})
            if protected is not None:
                ai_payload["api_key_protected"] = protected
            if normalized_name is not None:
                ai_payload["assistant_name"] = normalized_name
            if normalized_accessory is not None:
                ai_payload["assistant_accessory"] = normalized_accessory
            payload["ai"] = ai_payload
            self._write_unlocked(payload)
        return self.ai_status()

    def update_ai_api_key(self, api_key: str) -> dict[str, Any]:
        return self.update_ai_settings(api_key=api_key)

    def clear_ai_api_key(self) -> dict[str, Any]:
        with self._lock:
            payload = self._read_unlocked()
            ai_payload = payload.get("ai")
            if isinstance(ai_payload, dict):
                ai_payload.pop("api_key_protected", None)
                payload["ai"] = ai_payload
                self._write_unlocked(payload)
        return self.ai_status()

    def _write_unlocked(self, payload: dict[str, Any]) -> None:
        self.paths.settings.parent.mkdir(parents=True, exist_ok=True)
        temp = self.paths.settings.with_suffix(".tmp")
        temp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )
        os.replace(temp, self.paths.settings)
