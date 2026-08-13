from __future__ import annotations

import argparse
import sys
from pathlib import Path


def numeric_version(version: str) -> tuple[int, int, int, int]:
    core = version.split("-", 1)[0]
    values = [int(part) for part in core.split(".")]
    if not 1 <= len(values) <= 4:
        raise ValueError(f"无效版本号：{version}")
    return tuple((values + [0] * 4)[:4])  # type: ignore[return-value]


def windows_version_text(version: str) -> str:
    parts = numeric_version(version)
    tuple_text = ", ".join(str(value) for value in parts)
    return f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=({tuple_text}),
    prodvers=({tuple_text}),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '080404b0',
        [StringStruct('CompanyName', '码熊'),
         StringStruct('FileDescription', '码熊 PDM 数据字典工作台'),
         StringStruct('FileVersion', '{version}'),
         StringStruct('InternalName', 'CodeBear'),
         StringStruct('LegalCopyright', 'Copyright (c) 2026'),
         StringStruct('OriginalFilename', 'CodeBear.exe'),
         StringStruct('ProductName', '码熊'),
         StringStruct('ProductVersion', '{version}')]
      )
    ]),
    VarFileInfo([VarStruct('Translation', [2052, 1200])])
  ]
)
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    root = arguments.root.resolve()
    output = arguments.output.resolve()
    sys.path.insert(0, str(root))

    from backend.portable import create_app_icon

    version = (root / "VERSION").read_text(encoding="utf-8").strip()
    output.mkdir(parents=True, exist_ok=True)
    create_app_icon(256).save(
        output / "maxiong.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    (output / "windows-version.txt").write_text(
        windows_version_text(version),
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
