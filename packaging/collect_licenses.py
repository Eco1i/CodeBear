from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import shutil
from collections import deque
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


PYTHON_ROOTS = {
    "fastapi": set(),
    "uvicorn": {"standard"},
    "lxml": set(),
    "python-multipart": set(),
    "pydantic": set(),
    "pyinstaller": set(),
    "pystray": set(),
    "pillow": set(),
}
LICENSE_PREFIXES = ("license", "copying", "notice", "authors")
FALLBACK_LICENSES = {
    ("@ant-design/icons-svg", "MIT"): """MIT LICENSE

Copyright (c) 2018-present Ant UED, https://xtech.antfin.com/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
\"Software\"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
""",
    ("is-mobile", "MIT"): """The MIT License (MIT)
Copyright (c) 2013 Julian Gruber <julian@juliangruber.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the \"Software\"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
""",
}


def safe_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]+", "-", value).strip("-")


def requirement_applies(requirement: Requirement, extras: set[str]) -> bool:
    if requirement.marker is None:
        return True
    return any(requirement.marker.evaluate({"extra": extra}) for extra in extras | {""})


def python_distributions() -> list[importlib.metadata.Distribution]:
    installed = {
        canonicalize_name(distribution.metadata["Name"]): distribution
        for distribution in importlib.metadata.distributions()
        if distribution.metadata.get("Name")
    }
    queue = deque((canonicalize_name(name), extras) for name, extras in PYTHON_ROOTS.items())
    selected: dict[str, importlib.metadata.Distribution] = {}
    while queue:
        name, extras = queue.popleft()
        if name in selected:
            continue
        distribution = installed.get(name)
        if distribution is None:
            raise RuntimeError(f"构建环境缺少 Python 依赖：{name}")
        selected[name] = distribution
        for raw_requirement in distribution.requires or ():
            requirement = Requirement(raw_requirement)
            if requirement_applies(requirement, extras):
                queue.append((canonicalize_name(requirement.name), set(requirement.extras)))
    return sorted(selected.values(), key=lambda item: canonicalize_name(item.metadata["Name"]))


def copy_python_licenses(output: Path) -> list[str]:
    manifest = ["Python dependencies distributed with CodeBear", ""]
    for distribution in python_distributions():
        name = distribution.metadata["Name"]
        version = distribution.version
        license_expression = (
            distribution.metadata.get("License-Expression")
            or distribution.metadata.get("License")
            or "See bundled license files"
        ).strip().replace("\n", " ")
        copied = 0
        for relative_file in distribution.files or ():
            if not any(part.casefold().startswith(LICENSE_PREFIXES) for part in relative_file.parts):
                continue
            source = Path(distribution.locate_file(relative_file))
            if not source.is_file():
                continue
            destination = output / (
                "python-"
                + safe_name(name)
                + "-"
                + safe_name(version)
                + "-"
                + safe_name("-".join(relative_file.parts))
            )
            shutil.copy2(source, destination)
            copied += 1
        manifest.append(f"- {name} {version} | {license_expression} | license files: {copied}")
    return manifest


def copy_frontend_licenses(root: Path, output: Path) -> list[str]:
    lock = json.loads((root / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
    manifest = ["Frontend production dependencies distributed with CodeBear", ""]
    seen: set[tuple[str, str]] = set()
    for package_path, entry in sorted(lock.get("packages", {}).items()):
        if not package_path or entry.get("dev"):
            continue
        directory = root / "frontend" / package_path
        package_json = directory / "package.json"
        if not package_json.is_file():
            continue
        package = json.loads(package_json.read_text(encoding="utf-8"))
        name = str(package.get("name") or package_path)
        version = str(package.get("version") or entry.get("version") or "unknown")
        identity = (name, version)
        if identity in seen:
            continue
        seen.add(identity)
        license_expression = str(package.get("license") or entry.get("license") or "See package metadata")
        copied = 0
        for source in sorted(directory.iterdir()):
            if not source.is_file() or not source.name.casefold().startswith(LICENSE_PREFIXES):
                continue
            destination = output / (
                "frontend-"
                + safe_name(name)
                + "-"
                + safe_name(version)
                + "-"
                + safe_name(source.name)
            )
            shutil.copy2(source, destination)
            copied += 1
        fallback = FALLBACK_LICENSES.get((name, license_expression))
        if copied == 0 and fallback:
            destination = output / (
                "frontend-" + safe_name(name) + "-" + safe_name(version) + "-LICENSE.txt"
            )
            destination.write_text(fallback, encoding="utf-8", newline="\n")
            copied = 1
        manifest.append(f"- {name} {version} | {license_expression} | license files: {copied}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="收集绿色版第三方依赖清单和许可证")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    root = arguments.root.resolve()
    output = arguments.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest = copy_python_licenses(output)
    manifest.extend(("", *copy_frontend_licenses(root, output)))
    (output / "DEPENDENCY-MANIFEST.txt").write_text(
        "\n".join(manifest) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
