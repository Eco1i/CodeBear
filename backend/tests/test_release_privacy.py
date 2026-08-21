from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "packaging" / "release_privacy.py"
SPEC = importlib.util.spec_from_file_location("codebear_release_privacy", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
release_privacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_privacy)


def test_tracked_fixture_is_the_only_allowed_pdm() -> None:
    release_privacy.assert_private_paths_absent(
        ["frontend/e2e/fixtures/sample.pdm", "backend/app/main.py"],
        label="test",
        allowlist=release_privacy.ALLOWED_TRACKED_PRIVATE_FILES,
    )

    with pytest.raises(RuntimeError, match="business.pdm"):
        release_privacy.assert_private_paths_absent(
            ["docs/business.pdm"],
            label="test",
            allowlist=release_privacy.ALLOWED_TRACKED_PRIVATE_FILES,
        )


@pytest.mark.parametrize(
    "path",
    [
        "CodeBear/data",
        "CodeBear/data/maxiong.db",
        "CodeBear\\output\\export.cbbak",
        "CodeBear/settings.json",
        "CodeBear/private.key",
    ],
)
def test_release_paths_reject_private_data(path: str) -> None:
    with pytest.raises(RuntimeError, match="隐私检查失败"):
        release_privacy.assert_private_paths_absent([path], label="test")


def test_release_tree_rejects_generated_database(tmp_path: Path) -> None:
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "maxiong.db").write_bytes(b"not-a-real-database")

    with pytest.raises(RuntimeError, match="maxiong.db"):
        release_privacy.verify_release_tree(tmp_path)
