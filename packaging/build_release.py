from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import venv
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = ROOT / "build"
RELEASE_ROOT = ROOT / "release"


def run(command: list[str], *, cwd: Path = ROOT) -> None:
    printable = subprocess.list2cmdline(command)
    print(f"> {printable}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def safe_remove(path: Path, parent: Path) -> None:
    resolved = path.resolve()
    resolved.relative_to(parent.resolve())
    if resolved == parent.resolve():
        raise RuntimeError(f"拒绝删除父目录：{resolved}")
    if resolved.is_dir():
        shutil.rmtree(resolved)
    elif resolved.exists():
        resolved.unlink()


def read_version() -> str:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise RuntimeError(f"VERSION 格式无效：{version}")
    return version


def verify_version_sync(version: str) -> None:
    config = (ROOT / "backend" / "app" / "config.py").read_text(encoding="utf-8")
    match = re.search(r'^APP_VERSION\s*=\s*"([^"]+)"', config, re.MULTILINE)
    package = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
    values = {
        "VERSION": version,
        "backend/app/config.py": match.group(1) if match else "<missing>",
        "frontend/package.json": package.get("version"),
        "frontend/package-lock.json": lock.get("version"),
    }
    mismatches = {key: value for key, value in values.items() if value != version}
    if mismatches:
        raise RuntimeError(f"版本号未同步：{mismatches}")


def venv_python(environment: Path) -> Path:
    return environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ensure_build_environment() -> Path:
    environment = ROOT / ".build-venv"
    python = venv_python(environment)
    if not python.exists():
        print(f"创建构建环境：{environment}", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    run([str(python), "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", str(ROOT / "backend" / "requirements.txt"), "-r", str(ROOT / "packaging" / "requirements-build.txt")])
    return python


def npm_command() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def build_frontend() -> None:
    run([npm_command(), "ci"], cwd=ROOT / "frontend")
    run([npm_command(), "run", "build"], cwd=ROOT / "frontend")


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


def write_release_documents(target: Path, version: str, build_python: Path) -> None:
    instructions = f"""码熊 v{version} 绿色版

首次使用
1. 请先完整解压压缩包，不要直接在压缩软件内运行。
2. 双击“CodeBear.exe”，默认浏览器会自动打开工作台。
3. 程序仅监听本机 127.0.0.1，不会向局域网开放。

退出程序
- 在 Windows 任务栏通知区域找到码熊图标，右键选择“退出码熊”。
- 只关闭浏览器不会停止码熊服务。

数据位置
- 数据、项目副本和数据库都保存在程序同级的 data 文件夹。
- 分享此绿色版时，发布包本身不包含制作者的 data、数据库或 PDM 文件。
- 可通过页面右上角“备份迁移”按项目、文件夹或 PDM 导出和导入 .cbbak。
- 从旧版升级时，可在新版“备份迁移”中直接读取旧版程序同级的 data 目录并选择迁移范围。

以后升级
1. 先从托盘退出旧版码熊。
2. 将新版完整解压到新目录并启动。
3. 在新版“备份迁移”中读取旧版 data，选择需要的内容迁移；旧目录不会被修改。
4. 确认新版本数据无误后，再自行决定是否保留旧目录。
"""
    build_time = datetime.now().astimezone().isoformat(timespec="seconds")
    commit = git_value("rev-parse", "--short", "HEAD")
    version_info = f"""产品：码熊
版本：{version}
平台：Windows x64
Git 提交：{commit}
构建时间：{build_time}
运行地址：http://127.0.0.1:8765
"""
    (target / "使用说明.txt").write_text(instructions, encoding="utf-8", newline="\r\n")
    (target / "版本信息.txt").write_text(version_info, encoding="utf-8", newline="\r\n")
    shutil.copy2(ROOT / "LICENSE", target / "LICENSE.txt")
    shutil.copy2(ROOT / "THIRD_PARTY_NOTICES.md", target / "THIRD-PARTY-NOTICES.txt")
    license_dir = target / "LICENSES"
    license_dir.mkdir(exist_ok=True)
    run([
        str(build_python),
        str(ROOT / "packaging" / "collect_licenses.py"),
        "--root",
        str(ROOT),
        "--output",
        str(license_dir),
    ])


def build_executable(build_python: Path) -> Path:
    assets = BUILD_ROOT / "release-assets"
    pyinstaller_work = BUILD_ROOT / "pyinstaller-work"
    pyinstaller_dist = BUILD_ROOT / "pyinstaller-dist"
    for path in (assets, pyinstaller_work, pyinstaller_dist):
        safe_remove(path, BUILD_ROOT)

    run([str(build_python), str(ROOT / "packaging" / "generate_release_assets.py"), "--root", str(ROOT), "--output", str(assets)])
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
        str(ROOT / "packaging" / "maxiong.spec"),
    ])
    result = pyinstaller_dist / "CodeBear"
    if not (result / "CodeBear.exe").is_file():
        raise RuntimeError("PyInstaller 未生成预期的 CodeBear.exe")
    return result


def make_zip(source: Path, destination: Path) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source.parent))


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def verify_release(archive_path: Path, version: str) -> None:
    print("执行解压启动验收……", flush=True)
    with tempfile.TemporaryDirectory(prefix="maxiong-release-check-") as temp_name:
        temp = Path(temp_name)
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
            if any("/data/" in name.replace("\\", "/") for name in names):
                raise RuntimeError("发布包意外包含 data 目录")
            archive.extractall(temp)

        executable = next(temp.glob("*/CodeBear.exe"), None)
        if executable is None:
            raise RuntimeError("解压后未找到 CodeBear.exe")
        port = available_port()
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        process = subprocess.Popen(
            [str(executable), "--no-browser", "--no-tray", "--port", str(port)],
            cwd=executable.parent,
            creationflags=creation_flags,
            env={**os.environ, "MAXIONG_SUPPRESS_DIALOGS": "1"},
        )
        try:
            deadline = time.monotonic() + 30
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
            if health is None:
                raise RuntimeError("30 秒内未能访问绿色版健康检查")
            if health.get("version") != version or health.get("status") != "ok":
                raise RuntimeError(f"绿色版健康检查异常：{health}")
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=3) as response:
                page = response.read().decode("utf-8")
            if 'id="root"' not in page:
                raise RuntimeError("绿色版未正确提供前端页面")
            data_dir = executable.parent / "data"
            if not (data_dir / "maxiong.db").is_file() or not (data_dir / "workspace").is_dir():
                raise RuntimeError("绿色版未在程序同级创建 data 工作区")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)
    print("解压启动验收通过。", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="构建码熊 Windows x64 绿色版")
    parser.add_argument("--skip-npm-ci", action="store_true", help="复用现有 node_modules，仅用于本机调试")
    arguments = parser.parse_args()

    version = read_version()
    verify_version_sync(version)
    print(f"开始构建码熊 v{version} Windows x64 绿色版", flush=True)

    if arguments.skip_npm_ci:
        run([npm_command(), "run", "build"], cwd=ROOT / "frontend")
    else:
        build_frontend()
    build_python = ensure_build_environment()
    executable_dir = build_executable(build_python)

    RELEASE_ROOT.mkdir(parents=True, exist_ok=True)
    package_name = f"CodeBear-v{version}-win-x64"
    package_dir = RELEASE_ROOT / package_name
    archive_path = RELEASE_ROOT / f"{package_name}.zip"
    checksum_path = RELEASE_ROOT / f"{package_name}.zip.sha256"
    for path in (package_dir, archive_path, checksum_path):
        safe_remove(path, RELEASE_ROOT)

    shutil.copytree(executable_dir, package_dir)
    write_release_documents(package_dir, version, build_python)
    make_zip(package_dir, archive_path)
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    checksum_path.write_text(f"{digest}  {archive_path.name}\n", encoding="ascii", newline="\n")
    verify_release(archive_path, version)

    print(f"发布目录：{package_dir}", flush=True)
    print(f"发布压缩包：{archive_path}", flush=True)
    print(f"SHA256：{digest}", flush=True)


if __name__ == "__main__":
    main()
