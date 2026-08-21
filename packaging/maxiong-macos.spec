from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


root = Path(SPECPATH).resolve().parent
release_assets = root / "build" / "release-assets"
version = (root / "VERSION").read_text(encoding="utf-8").strip()
bundle_version = version.split("-", 1)[0]

a = Analysis(
    [str(root / "backend" / "portable.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[(str(root / "frontend" / "dist"), "frontend/dist")],
    hiddenimports=(
        collect_submodules("uvicorn")
        + ["keyring.backends.macOS", "pystray._darwin"]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "backend.tray_menu", "pystray._win32"],
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

app = BUNDLE(
    coll,
    name="CodeBear.app",
    icon=str(release_assets / "maxiong.icns"),
    bundle_identifier="com.eco1i.codebear",
    version=bundle_version,
    info_plist={
        "CFBundleDisplayName": "码熊",
        "CFBundleName": "CodeBear",
        "CFBundleShortVersionString": bundle_version,
        "CFBundleVersion": bundle_version,
        "LSApplicationCategoryType": "public.app-category.developer-tools",
        "LSMinimumSystemVersion": "13.0",
        "LSUIElement": True,
        "NSHighResolutionCapable": True,
        "NSHumanReadableCopyright": "Copyright (c) 2026 CodeBear contributors",
    },
)
