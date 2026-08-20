from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?")
APP_VERSION_PATTERN = re.compile(r'^(APP_VERSION\s*=\s*)"[^"]+"', re.MULTILINE)


def validate_version(version: str) -> str:
    normalized = version.strip()
    if not VERSION_PATTERN.fullmatch(normalized):
        raise ValueError(f"版本号格式无效：{version}")
    return normalized


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"JSON 顶层必须是对象：{path}")
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def version_values(root: Path = ROOT) -> dict[str, str]:
    config_text = (root / "backend" / "app" / "config.py").read_text(encoding="utf-8")
    config_match = APP_VERSION_PATTERN.search(config_text)
    package = _read_json(root / "frontend" / "package.json")
    lock = _read_json(root / "frontend" / "package-lock.json")
    lock_root = lock.get("packages", {}).get("", {})
    return {
        "VERSION": (root / "VERSION").read_text(encoding="utf-8").strip(),
        "backend/app/config.py": config_match.group(0).split('"', 1)[1].rsplit('"', 1)[0]
        if config_match
        else "<missing>",
        "frontend/package.json": str(package.get("version", "<missing>")),
        "frontend/package-lock.json": str(lock.get("version", "<missing>")),
        "frontend/package-lock.json packages['']": str(lock_root.get("version", "<missing>")),
    }


def current_version(root: Path = ROOT) -> str:
    return validate_version((root / "VERSION").read_text(encoding="utf-8"))


def verify_version_sync(root: Path = ROOT) -> str:
    values = version_values(root)
    version = validate_version(values["VERSION"])
    mismatches = {name: value for name, value in values.items() if value != version}
    if mismatches:
        raise RuntimeError(f"版本号未同步：{mismatches}")
    return version


def set_version(version: str, root: Path = ROOT) -> None:
    normalized = validate_version(version)

    config_path = root / "backend" / "app" / "config.py"
    config_text = config_path.read_text(encoding="utf-8")
    config_text, count = APP_VERSION_PATTERN.subn(rf'\g<1>"{normalized}"', config_text)
    if count != 1:
        raise RuntimeError("无法唯一定位 backend/app/config.py 中的 APP_VERSION")

    package_path = root / "frontend" / "package.json"
    package = _read_json(package_path)
    package["version"] = normalized

    lock_path = root / "frontend" / "package-lock.json"
    lock = _read_json(lock_path)
    lock["version"] = normalized
    lock_root = lock.get("packages", {}).get("")
    if not isinstance(lock_root, dict):
        raise RuntimeError("package-lock.json 缺少 packages['']")
    lock_root["version"] = normalized

    (root / "VERSION").write_text(normalized + "\n", encoding="utf-8", newline="\n")
    config_path.write_text(config_text, encoding="utf-8", newline="\n")
    _write_json(package_path, package)
    _write_json(lock_path, lock)
    verify_version_sync(root)


def main() -> None:
    parser = argparse.ArgumentParser(description="统一管理码熊各模块版本号")
    parser.add_argument("--set", dest="new_version", help="同步设置新的语义化版本号")
    parser.add_argument("--check", action="store_true", help="校验所有版本字段是否一致")
    arguments = parser.parse_args()

    if arguments.new_version:
        set_version(arguments.new_version)
        print(f"版本号已同步更新：{verify_version_sync()}")
    elif arguments.check:
        print(f"版本号同步校验通过：{verify_version_sync()}")
    else:
        print(verify_version_sync())


if __name__ == "__main__":
    main()
