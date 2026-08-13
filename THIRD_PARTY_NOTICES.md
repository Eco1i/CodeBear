# 第三方组件说明

码熊依赖并在 Windows 绿色版中分发多个开源组件。各组件版权归其权利人所有，并继续适用各自许可证。

主要后端与打包依赖包括 FastAPI（MIT）、Uvicorn（BSD-3-Clause）、lxml（BSD-3-Clause）、Pydantic（MIT）、python-multipart（Apache-2.0）、PyInstaller（GPL-2.0-or-later with bootloader exception）、pystray（LGPL-3.0）、Pillow（HPND）。

主要前端依赖包括 React、Ant Design、CodeMirror 和 Vite（主要为 MIT），TypeScript（Apache-2.0），Noto Sans SC 与 JetBrains Mono（SIL Open Font License 1.1）。

精确版本以 `backend/requirements.txt`、`packaging/requirements-build.txt` 和 `frontend/package-lock.json` 为准。绿色版的 `LICENSES/DEPENDENCY-MANIFEST.txt` 会列出随包分发的 Python 依赖和前端生产依赖，并附带依赖包自身提供的许可证、版权或 NOTICE 文件；本文件不是对各许可证条款的替代。
