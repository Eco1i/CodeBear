from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


root = Path(SPECPATH).resolve().parent
release_assets = root / "build" / "release-assets"

a = Analysis(
    [str(root / "backend" / "portable.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[(str(root / "frontend" / "dist"), "frontend/dist")],
    hiddenimports=collect_submodules("uvicorn") + ["pystray._win32", "backend.tray_menu"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest"],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="CodeBear",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(release_assets / "maxiong.ico"),
    version=str(release_assets / "windows-version.txt"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="CodeBear",
)
