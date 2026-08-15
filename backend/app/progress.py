from __future__ import annotations

import threading
import time
from typing import Any

# 完成/出错状态的进度条目保留时间，超时后回到 idle 避免陈旧数据
DONE_TTL_SECONDS = 30.0


class RefreshProgressStore:
    """单用户本地应用内的刷新进度登记表，供前端轮询展示进度条。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[str, dict[str, Any]] = {}

    def update(self, project_id: str, processed: int, total: int, current_file: str) -> None:
        with self._lock:
            self._entries[project_id] = {
                "state": "running",
                "processed": processed,
                "total": total,
                "current_file": current_file,
                "updated_at": time.time(),
            }

    def finish(self, project_id: str, *, error: str | None = None) -> None:
        with self._lock:
            entry = self._entries.get(project_id) or {
                "processed": 0,
                "total": 0,
                "current_file": "",
            }
            entry["state"] = "error" if error else "done"
            if error:
                entry["error"] = error
            entry["updated_at"] = time.time()
            self._entries[project_id] = entry

    def get(self, project_id: str) -> dict[str, Any]:
        with self._lock:
            entry = self._entries.get(project_id)
            if entry is None:
                return {"state": "idle"}
            if entry["state"] in ("done", "error") and time.time() - entry.get("updated_at", 0) > DONE_TTL_SECONDS:
                self._entries.pop(project_id, None)
                return {"state": "idle"}
            return dict(entry)
