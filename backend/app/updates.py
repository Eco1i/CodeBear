from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from threading import RLock
from typing import Any

from backend.platform_support import release_target

from .config import APP_VERSION

logger = logging.getLogger("backend.app.updates")

RELEASES_API = "https://api.github.com/repos/Eco1i/CodeBear/releases"
WEB_LATEST_URL = "https://github.com/Eco1i/CodeBear/releases/latest"
REQUEST_TIMEOUT_SECONDS = 10
CHECK_INTERVAL_SECONDS = 6 * 3600
USER_AGENT = "CodeBear-UpdateCheck"
MAX_NOTES_LENGTH = 60_000


def parse_version(value: str) -> tuple[int, int, int]:
    """把 'v1.2.0'、'1.2.0-beta' 等解析为 (主, 次, 修订)，非数字按 0 兜底。"""
    text = (value or "").strip().lstrip("vV")
    text = text.split("-", 1)[0]
    numbers: list[int] = []
    for part in text.split(".")[:3]:
        digits = "".join(ch for ch in part if ch.isdigit())
        numbers.append(int(digits) if digits else 0)
    while len(numbers) < 3:
        numbers.append(0)
    return (numbers[0], numbers[1], numbers[2])


def is_newer(latest: str, current: str) -> bool:
    return parse_version(latest) > parse_version(current)


def parse_tag_from_location(location: str) -> str:
    """从 releases/latest 的重定向地址中解析 tag，如 /releases/tag/v1.2.0 → v1.2.0。"""
    match = re.search(r"/releases/tag/([^/?#]+)", location or "")
    return match.group(1) if match else ""


class UpdateService:
    """查询 GitHub Releases 的最新稳定版，结果缓存到本地 JSON 文件。"""

    def __init__(self, cache_path: Path, *, target: str | None = None):
        self.cache_path = cache_path
        self.target = target or release_target()
        self._lock = RLock()

    # ---- 缓存 ----

    def _read_cache(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        if not isinstance(payload, dict):
            return {}
        cached_target = str(payload.get("target") or "")
        return {} if cached_target and cached_target != self.target else payload

    def _write_cache(self, state: dict[str, Any]) -> None:
        temporary = self.cache_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(state, ensure_ascii=False),
            encoding="utf-8",
        )
        temporary.replace(self.cache_path)

    def current_state(self) -> dict[str, Any]:
        with self._lock:
            cached = self._read_cache()
            return self._state_from_cache(cached)

    def _state_from_cache(self, cached: dict[str, Any]) -> dict[str, Any]:
        latest = cached.get("latest")
        cached_target = str(cached.get("target") or "")
        if cached_target and cached_target != self.target:
            latest = None
        elif isinstance(latest, dict):
            latest = dict(latest)
            if "download_url" not in latest:
                latest["download_url"] = (
                    str(latest.get("zip_url") or "") if self.target.startswith("win-") else ""
                )
            latest.setdefault("checksum_url", "")
            latest.setdefault("asset_name", "")
        ignored = cached.get("ignored_version", "")
        update_available = False
        if isinstance(latest, dict) and latest.get("version"):
            version = str(latest["version"])
            if is_newer(version, APP_VERSION) and version != ignored:
                update_available = True
        return {
            "current_version": APP_VERSION,
            "target": self.target,
            "status": "update_available" if update_available else (
                "up_to_date" if isinstance(latest, dict) and latest.get("version") else "unknown"
            ),
            "latest": latest,
            "checked_at": cached.get("checked_at"),
        }

    # ---- GitHub ----

    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args: object, **kwargs: object):
            return None

    @classmethod
    def _fetch_latest_tag(cls) -> str:
        """走网页端点 releases/latest 的重定向，不受 API 匿名限流影响。"""
        opener = urllib.request.build_opener(cls._NoRedirect)
        request = urllib.request.Request(
            WEB_LATEST_URL,
            headers={"User-Agent": "Mozilla/5.0 (CodeBear-UpdateCheck)"},
        )
        location = ""
        try:
            with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                location = response.headers.get("Location", "")
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 307, 308):
                location = exc.headers.get("Location", "")
            else:
                raise
        return parse_tag_from_location(location)

    @staticmethod
    def _fetch_releases() -> list[dict[str, Any]]:
        request = urllib.request.Request(
            RELEASES_API,
            headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload if isinstance(payload, list) else []

    def _latest_stable_release(self, releases: list[dict[str, Any]]) -> dict[str, Any] | None:
        for release in releases:
            if not isinstance(release, dict):
                continue
            if release.get("draft") or release.get("prerelease"):
                continue
            tag = str(release.get("tag_name") or "").strip()
            if not tag:
                continue
            package_asset: dict[str, Any] | None = None
            checksum_url = ""
            extension = ".zip" if self.target.startswith("win-") else ".dmg"
            suffix = f"-{self.target}{extension}".casefold()
            assets = release.get("assets") or []
            for asset in assets:
                if not isinstance(asset, dict):
                    continue
                name = str(asset.get("name") or "")
                if name.casefold().endswith(suffix):
                    package_asset = asset
                    break
            if package_asset:
                package_name = str(package_asset.get("name") or "")
                checksum_name = f"{package_name}.sha256".casefold()
                for asset in assets:
                    if not isinstance(asset, dict):
                        continue
                    if str(asset.get("name") or "").casefold() == checksum_name:
                        checksum_url = str(asset.get("browser_download_url") or "")
                        break
            else:
                package_name = ""
            digest = str(package_asset.get("digest") or "") if package_asset else ""
            sha256 = digest.removeprefix("sha256:").lower() if re.fullmatch(r"sha256:[0-9a-fA-F]{64}", digest) else ""
            return {
                "version": tag,
                "published_at": str(release.get("published_at") or ""),
                "release_url": str(release.get("html_url") or ""),
                "download_url": str(package_asset.get("browser_download_url") or "") if package_asset else "",
                "checksum_url": checksum_url,
                "asset_name": package_name,
                "sha256": sha256,
                "notes": str(release.get("body") or "")[:MAX_NOTES_LENGTH],
            }
        return None

    # ---- 检查 ----

    def _enrich_release(self, tag: str, release_url: str) -> dict[str, Any]:
        """仅当存在新版本时调用 API 补充说明与资产；失败降级为最小信息。"""
        try:
            releases = self._fetch_releases()
            for item in releases:
                if isinstance(item, dict) and item.get("tag_name") == tag:
                    enriched = self._latest_stable_release([item])
                    if enriched:
                        return enriched
                    break
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            logger.warning("获取发布详情失败：%s", exc)
        return {
            "version": tag,
            "published_at": "",
            "release_url": release_url,
            "download_url": "",
            "checksum_url": "",
            "asset_name": "",
            "sha256": "",
            "notes": "（发布说明获取失败，请前往 Release 页面查看）",
        }

    def check_now(self) -> dict[str, Any]:
        with self._lock:
            cached = self._read_cache()
            try:
                tag = self._fetch_latest_tag()
            except (OSError, ValueError) as exc:
                logger.warning("检查更新失败：%s", exc)
                return self._state_from_cache(cached)
            if not tag or "-" in tag:
                # 无 tag，或最新发布是预发布版：不视为更新
                return self._state_from_cache(cached)
            release_url = f"https://github.com/Eco1i/CodeBear/releases/tag/{tag}"
            if not is_newer(tag, APP_VERSION):
                release = {
                    "version": tag,
                    "published_at": "",
                    "release_url": release_url,
                    "download_url": "",
                    "checksum_url": "",
                    "asset_name": "",
                    "sha256": "",
                    "notes": "",
                }
            else:
                release = self._enrich_release(tag, release_url)
            state = {
                "checked_at": int(time.time()),
                "target": self.target,
                "latest": release,
                "ignored_version": cached.get("ignored_version", ""),
            }
            try:
                self._write_cache(state)
            except OSError as exc:
                logger.warning("写入更新缓存失败：%s", exc)
            return self._state_from_cache(state)

    def ignore_version(self, version: str) -> dict[str, Any]:
        with self._lock:
            cached = self._read_cache()
            cached["target"] = self.target
            cached["ignored_version"] = (version or "").strip()[:100]
            self._write_cache(cached)
            return self._state_from_cache(cached)
