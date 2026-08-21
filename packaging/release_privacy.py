from __future__ import annotations

import argparse
import subprocess
from pathlib import Path, PurePosixPath
from typing import Iterable


ALLOWED_TRACKED_PRIVATE_FILES = {
    "frontend/e2e/fixtures/sample.pdm",
}
PRIVATE_DIRECTORY_NAMES = {
    "build",
    "data",
    "output",
    "pdm文件",
    "release",
}
PRIVATE_FILE_NAMES = {
    ".env",
    "settings.json",
}
PRIVATE_SUFFIXES = {
    ".cbbak",
    ".db",
    ".key",
    ".mobileprovision",
    ".p12",
    ".pdm",
    ".pem",
    ".pfx",
    ".sqlite",
    ".sqlite3",
}


def normalize_relative_path(value: str) -> str:
    return value.replace("\\", "/").strip("/")


def private_path_reason(value: str) -> str | None:
    normalized = normalize_relative_path(value)
    path = PurePosixPath(normalized)
    folded_parts = tuple(part.casefold() for part in path.parts)
    private_directories = {name.casefold() for name in PRIVATE_DIRECTORY_NAMES}
    for part in folded_parts:
        if part in private_directories:
            return f"包含本地数据目录 {part}"

    name = path.name.casefold()
    if name in {item.casefold() for item in PRIVATE_FILE_NAMES} or name.startswith(".env."):
        return f"包含本地设置文件 {path.name}"
    if path.suffix.casefold() in PRIVATE_SUFFIXES:
        return f"包含敏感文件类型 {path.suffix}"
    return None


def assert_private_paths_absent(
    paths: Iterable[str],
    *,
    label: str,
    allowlist: set[str] | None = None,
) -> None:
    allowed = {normalize_relative_path(item) for item in (allowlist or set())}
    violations: list[str] = []
    for value in paths:
        normalized = normalize_relative_path(value)
        if not normalized or normalized in allowed:
            continue
        reason = private_path_reason(normalized)
        if reason:
            violations.append(f"{normalized}（{reason}）")
    if violations:
        details = "\n- ".join(sorted(set(violations)))
        raise RuntimeError(f"{label}隐私检查失败：\n- {details}")


def tracked_files(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
    )
    return [item for item in result.stdout.decode("utf-8").split("\0") if item]


def verify_tracked_sources(root: Path) -> None:
    assert_private_paths_absent(
        tracked_files(root),
        label="受控源码",
        allowlist=ALLOWED_TRACKED_PRIVATE_FILES,
    )
    print("受控源码隐私检查通过。", flush=True)


def verify_release_tree(root: Path) -> None:
    paths = [str(path.relative_to(root)) for path in root.rglob("*")]
    assert_private_paths_absent(paths, label="发布包")
    print(f"发布包隐私检查通过：{root}", flush=True)


def verify_archive_members(names: Iterable[str]) -> None:
    assert_private_paths_absent(names, label="压缩包")


def main() -> None:
    parser = argparse.ArgumentParser(description="检查码熊受控源码是否包含本地或敏感数据文件")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    arguments = parser.parse_args()
    verify_tracked_sources(arguments.root.resolve())


if __name__ == "__main__":
    main()
