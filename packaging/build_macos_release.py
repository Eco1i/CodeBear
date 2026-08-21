from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import venv
from pathlib import Path

from versioning import verify_version_sync
from release_privacy import verify_release_tree, verify_tracked_sources


ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = ROOT / "build"
RELEASE_ROOT = ROOT / "release"


def run(command: list[str], *, cwd: Path = ROOT) -> None:
    print("> " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def safe_remove(path: Path, parent: Path) -> None:
    resolved = path.resolve()
    resolved.relative_to(parent.resolve())
    if resolved == parent.resolve():
        raise RuntimeError(f"拒绝删除父目录：{resolved}")
    if resolved.is_dir() and not resolved.is_symlink():
        shutil.rmtree(resolved)
    elif resolved.exists() or resolved.is_symlink():
        resolved.unlink()


def ensure_build_environment() -> Path:
    environment = ROOT / ".build-venv"
    python = environment / "bin" / "python"
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    run([
        str(python),
        "-m",
        "pip",
        "install",
        "--quiet",
        "--disable-pip-version-check",
        "-r",
        str(ROOT / "backend" / "requirements.txt"),
        "-r",
        str(ROOT / "packaging" / "requirements-build.txt"),
    ])
    return python


def build_frontend(*, skip_npm_ci: bool) -> None:
    if not skip_npm_ci:
        run(["npm", "ci"], cwd=ROOT / "frontend")
    run(["npm", "run", "build"], cwd=ROOT / "frontend")


def build_app(build_python: Path) -> Path:
    assets = BUILD_ROOT / "release-assets"
    pyinstaller_work = BUILD_ROOT / "pyinstaller-work-macos"
    pyinstaller_dist = BUILD_ROOT / "pyinstaller-dist-macos"
    for path in (assets, pyinstaller_work, pyinstaller_dist):
        safe_remove(path, BUILD_ROOT)

    run([
        str(build_python),
        str(ROOT / "packaging" / "generate_release_assets.py"),
        "--root",
        str(ROOT),
        "--output",
        str(assets),
    ])
    run([
        str(build_python),
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--workpath",
        str(pyinstaller_work),
        "--distpath",
        str(pyinstaller_dist),
        str(ROOT / "packaging" / "maxiong-macos.spec"),
    ])
    app = pyinstaller_dist / "CodeBear.app"
    executable = app / "Contents" / "MacOS" / "CodeBear"
    if not executable.is_file():
        raise RuntimeError("PyInstaller 未生成预期的 CodeBear.app")
    return app


def git_value(*arguments: str) -> str:
    try:
        result = subprocess.run(
            ["git", *arguments],
            cwd=ROOT,
            check=True,
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return result.stdout.strip() or "unknown"


def add_release_documents(app: Path, version: str, build_python: Path) -> None:
    resources = app / "Contents" / "Resources"
    resources.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "LICENSE", resources / "LICENSE.txt")
    shutil.copy2(ROOT / "THIRD_PARTY_NOTICES.md", resources / "THIRD-PARTY-NOTICES.txt")
    licenses = resources / "LICENSES"
    licenses.mkdir(exist_ok=True)
    run([
        str(build_python),
        str(ROOT / "packaging" / "collect_licenses.py"),
        "--root",
        str(ROOT),
        "--output",
        str(licenses),
    ])
    (resources / "版本信息.txt").write_text(
        "\n".join((
            "产品：码熊",
            f"版本：{version}",
            f"平台：macOS {machine_architecture()}",
            f"Git 提交：{git_value('rev-parse', '--short', 'HEAD')}",
            "运行地址：http://127.0.0.1:8765",
            "",
        )),
        encoding="utf-8",
        newline="\n",
    )


def machine_architecture() -> str:
    machine = platform.machine().casefold()
    if machine in {"arm64", "aarch64"}:
        return "arm64"
    if machine in {"x86_64", "amd64"}:
        return "x64"
    raise RuntimeError(f"不支持的 macOS 架构：{machine}")


def sign_and_verify(app: Path) -> None:
    run(["codesign", "--force", "--deep", "--sign", "-", str(app)])
    run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)])


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def verify_app(app: Path, version: str) -> None:
    print("执行 macOS 应用启动验收……", flush=True)
    executable = app / "Contents" / "MacOS" / "CodeBear"
    with tempfile.TemporaryDirectory(prefix="codebear-macos-check-") as temporary_name:
        data_dir = Path(temporary_name) / "data"
        port = available_port()
        process = subprocess.Popen(
            [str(executable), "--no-browser", "--no-tray", "--port", str(port)],
            cwd=executable.parent,
            env={
                **os.environ,
                "MAXIONG_APP_DATA_DIR": str(data_dir),
                "MAXIONG_SUPPRESS_DIALOGS": "1",
            },
        )
        try:
            deadline = time.monotonic() + 45
            health: dict[str, str] | None = None
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"码熊验收进程提前退出，退出码：{process.returncode}")
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as response:
                        health = json.loads(response.read().decode("utf-8"))
                    break
                except OSError:
                    time.sleep(0.2)
            if health is None or health.get("status") != "ok" or health.get("version") != version:
                raise RuntimeError(f"macOS 健康检查异常：{health}")
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=3) as response:
                page = response.read().decode("utf-8")
            if 'id="root"' not in page:
                raise RuntimeError("macOS 应用未正确提供前端页面")
            if not (data_dir / "maxiong.db").is_file() or not (data_dir / "workspace").is_dir():
                raise RuntimeError("macOS 应用未在 Application Support 等效测试目录创建数据")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
    print("macOS 应用启动验收通过。", flush=True)


def create_dmg(app: Path, destination: Path, version: str) -> None:
    with tempfile.TemporaryDirectory(prefix="codebear-dmg-") as temporary_name:
        staging = Path(temporary_name)
        shutil.copytree(app, staging / app.name, symlinks=True)
        (staging / "Applications").symlink_to("/Applications", target_is_directory=True)
        (staging / "首次运行说明.txt").write_text(
            "\n".join((
                f"码熊 v{version} macOS 测试版",
                "",
                "1. 将 CodeBear.app 拖入 Applications 文件夹。",
                "2. 首次打开若被系统拦截，请前往“系统设置 > 隐私与安全性”选择仍要打开。",
                "3. 码熊只监听本机 127.0.0.1，并在默认浏览器打开工作台。",
                "4. 数据保存在 ~/Library/Application Support/CodeBear。",
                "",
            )),
            encoding="utf-8",
            newline="\n",
        )
        run([
            "hdiutil",
            "create",
            "-volname",
            "码熊",
            "-srcfolder",
            str(staging),
            "-ov",
            "-format",
            "UDZO",
            str(destination),
        ])
    run(["hdiutil", "verify", str(destination)])


def verify_dmg(destination: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="codebear-dmg-check-") as temporary_name:
        mountpoint = Path(temporary_name) / "mount"
        mountpoint.mkdir()
        attached = False
        try:
            run([
                "hdiutil",
                "attach",
                "-nobrowse",
                "-readonly",
                "-mountpoint",
                str(mountpoint),
                str(destination),
            ])
            attached = True
            run([
                "codesign",
                "--verify",
                "--deep",
                "--strict",
                "--verbose=2",
                str(mountpoint / "CodeBear.app"),
            ])
            verify_release_tree(mountpoint / "CodeBear.app")
        finally:
            if attached:
                subprocess.run(["hdiutil", "detach", str(mountpoint)], check=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="构建码熊 macOS 桌面版")
    parser.add_argument("--skip-npm-ci", action="store_true", help="复用现有 node_modules，仅用于调试")
    parser.add_argument("--check-version-only", action="store_true", help="仅校验版本号")
    arguments = parser.parse_args()

    if sys.platform != "darwin":
        raise RuntimeError("macOS 发布包只能在 macOS 上构建")
    version = verify_version_sync()
    verify_tracked_sources(ROOT)
    if arguments.check_version_only:
        print(f"版本号同步校验通过：{version}")
        return

    architecture = machine_architecture()
    print(f"开始构建码熊 v{version} macOS {architecture} 桌面版", flush=True)
    build_frontend(skip_npm_ci=arguments.skip_npm_ci)
    build_python = ensure_build_environment()
    app = build_app(build_python)
    add_release_documents(app, version, build_python)
    verify_release_tree(app)
    sign_and_verify(app)
    verify_app(app, version)

    RELEASE_ROOT.mkdir(parents=True, exist_ok=True)
    package_name = f"CodeBear-v{version}-mac-{architecture}"
    dmg_path = RELEASE_ROOT / f"{package_name}.dmg"
    checksum_path = RELEASE_ROOT / f"{package_name}.dmg.sha256"
    for path in (dmg_path, checksum_path):
        safe_remove(path, RELEASE_ROOT)
    create_dmg(app, dmg_path, version)
    verify_dmg(dmg_path)
    digest = hashlib.sha256(dmg_path.read_bytes()).hexdigest()
    checksum_path.write_text(f"{digest}  {dmg_path.name}\n", encoding="ascii", newline="\n")

    print(f"macOS 发布包：{dmg_path}", flush=True)
    print(f"SHA256：{digest}", flush=True)


if __name__ == "__main__":
    main()
