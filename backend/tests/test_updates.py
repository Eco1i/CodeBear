from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.updates import UpdateService, is_newer, parse_tag_from_location, parse_version


def test_parse_version_handles_prefixes_and_suffixes() -> None:
    assert parse_version("v1.2.0") == (1, 2, 0)
    assert parse_version("1.2.0-beta.1") == (1, 2, 0)
    assert parse_version("V10.20.30") == (10, 20, 30)
    assert parse_version("1.2") == (1, 2, 0)
    assert parse_version("") == (0, 0, 0)


def test_is_newer_compares_semver() -> None:
    assert is_newer("1.2.0", "1.1.2")
    assert not is_newer("1.1.2", "1.2.0")
    assert not is_newer("1.2.0", "1.2.0")
    assert is_newer("v2.0.0", "1.9.9")


def test_parse_tag_from_location() -> None:
    assert parse_tag_from_location("https://github.com/Eco1i/CodeBear/releases/tag/v1.2.0") == "v1.2.0"
    assert parse_tag_from_location("/releases/tag/v1.2.0?x=1") == "v1.2.0"
    assert parse_tag_from_location("") == ""


def releases_payload() -> list[dict]:
    return [
        {
            "tag_name": "v9.9.10-rc1",
            "name": "rc",
            "draft": False,
            "prerelease": True,
            "html_url": "https://github.com/Eco1i/CodeBear/releases/tag/v9.9.10-rc1",
            "published_at": "2026-08-16T00:00:00Z",
            "body": "rc notes",
            "assets": [],
        },
        {
            "tag_name": "v9.9.9",
            "name": "码熊 v9.9.9",
            "draft": False,
            "prerelease": False,
            "html_url": "https://github.com/Eco1i/CodeBear/releases/tag/v9.9.9",
            "published_at": "2026-08-15T00:00:00Z",
            "body": "# 更新说明\n- 修复问题",
            "assets": [
                {"name": "CodeBear-v9.9.9-win-x64.zip", "browser_download_url": "https://example.com/a.zip"},
                {"name": "CodeBear-v9.9.9-win-x64.zip.sha256", "browser_download_url": "https://example.com/a.zip.sha256"},
            ],
        },
    ]


def patch_latest_tag(monkeypatch: pytest.MonkeyPatch, tag: str) -> None:
    monkeypatch.setattr(UpdateService, "_fetch_latest_tag", lambda self: tag)


def test_check_with_enriched_details(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")
    patch_latest_tag(monkeypatch, "v9.9.9")
    monkeypatch.setattr(UpdateService, "_fetch_releases", lambda self: releases_payload())
    state = service.check_now()
    assert state["status"] == "update_available"
    assert state["latest"]["version"] == "v9.9.9"
    assert state["latest"]["zip_url"] == "https://example.com/a.zip"
    assert state["latest"]["sha256"] == "https://example.com/a.zip.sha256"
    cached = json.loads((tmp_path / "update-check.json").read_text(encoding="utf-8"))
    assert cached["latest"]["version"] == "v9.9.9"


def test_check_falls_back_when_api_unavailable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")
    patch_latest_tag(monkeypatch, "v9.9.9")
    monkeypatch.setattr(UpdateService, "_fetch_releases", lambda self: (_ for _ in ()).throw(OSError("rate limit")))
    state = service.check_now()
    assert state["status"] == "update_available"
    assert state["latest"]["version"] == "v9.9.9"
    assert state["latest"]["zip_url"] == ""
    assert state["latest"]["release_url"] == "https://github.com/Eco1i/CodeBear/releases/tag/v9.9.9"


def test_check_up_to_date_without_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")
    patch_latest_tag(monkeypatch, "v1.1.2")
    state = service.check_now()
    assert state["status"] == "up_to_date"
    assert state["latest"]["version"] == "v1.1.2"


def test_check_ignores_prerelease(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")
    patch_latest_tag(monkeypatch, "v9.9.10-rc1")
    state = service.check_now()
    assert state["status"] == "unknown"
    assert state["latest"] is None


def test_check_returns_unknown_on_network_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")

    def fail(self) -> str:
        raise OSError("network down")

    monkeypatch.setattr(UpdateService, "_fetch_latest_tag", fail)
    state = service.check_now()
    assert state["status"] == "unknown"
    assert state["latest"] is None


def test_ignored_version_suppresses_update(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = UpdateService(tmp_path / "update-check.json")
    patch_latest_tag(monkeypatch, "v9.9.9")
    monkeypatch.setattr(UpdateService, "_fetch_releases", lambda self: releases_payload())
    assert service.check_now()["status"] == "update_available"
    assert service.ignore_version("v9.9.9")["status"] == "up_to_date"
    assert service.current_state()["status"] == "up_to_date"
