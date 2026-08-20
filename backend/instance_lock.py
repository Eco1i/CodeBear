from __future__ import annotations

import ctypes
import sys
from pathlib import Path
from typing import BinaryIO, Any


ERROR_ALREADY_EXISTS = 183


class SingleInstance:
    def __init__(self, port: int, data_dir: Path):
        self.already_exists = False
        self._handle: int | None = None
        self._kernel32: Any | None = None
        self._stream: BinaryIO | None = None

        if sys.platform == "win32":
            self._acquire_windows(port)
        else:
            self._acquire_posix(port, data_dir)

    def _acquire_windows(self, port: int) -> None:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool
        handle = kernel32.CreateMutexW(None, False, f"Local\\MaxiongPortable-{port}")
        if not handle:
            raise OSError(ctypes.get_last_error(), "无法创建码熊单实例锁")
        self._kernel32 = kernel32
        self._handle = int(handle)
        self.already_exists = ctypes.get_last_error() == ERROR_ALREADY_EXISTS

    def _acquire_posix(self, port: int, data_dir: Path) -> None:
        import fcntl

        data_dir.mkdir(parents=True, exist_ok=True)
        stream = (data_dir / f".codebear-{port}.lock").open("a+b")
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.already_exists = True
        self._stream = stream

    def close(self) -> None:
        if self._handle and self._kernel32 is not None:
            self._kernel32.CloseHandle(ctypes.c_void_p(self._handle))
            self._handle = None
        if self._stream is not None:
            self._stream.close()
            self._stream = None

    def __enter__(self) -> "SingleInstance":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
