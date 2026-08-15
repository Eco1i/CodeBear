# 码熊 CodeBear

![码熊图标](frontend/public/codebear-icon-v3.png)

码熊是一个面向 PowerDesigner PDM 的本地数据字典工作台。它在本机解析、索引和管理 PDM 副本，让你可以快速浏览表与字段、搜索数据字典、安全修订字段，并生成多种数据库的建表脚本。

> 当前稳定版本：`v1.3.0` · 主要支持平台：Windows 10/11 x64

## 功能

- 按项目和多级目录管理 `.pdm` 文件，导入时只复制副本，不修改源文件。
- 解析表、字段、主键、类型、长度、可空、缺省值与备注。
- 使用本地全文索引按表名、描述、注释或字段进行快速范围搜索。
- 安全编辑字段，写回前检查外部修改、创建备份并重新解析校验。
- 提供回收站、`.cbbak` 选择性备份，以及旧版 `data` 目录迁移。
- 生成 MySQL、Oracle、达梦、TDSQL MySQL 版和 Apache Ignite 建表脚本。
- 内置字典中心：手工维护数据字典，或从 Excel 批量导入（字典值列可多选组成唯一组合键），并将字典绑定到字段快速查询。
- 内置表关系浏览：自动解析 PDM 外键并支持手工维护关系，抽屉列表与关系图（聚焦高亮、悬停查看外键、双击切换中心）随 `.cbbak` 备份迁移。
- 内置更新检查：自动查询 GitHub Releases，发现新版本在顶栏提示，更新面板提供发布说明、SHA-256 校验与升级迁移引导。
- 可选 DeepSeek AI 助手，用自然语言查询本地数据字典。
- Windows 托盘运行，提供开箱即用的 x64 绿色版。

## 界面预览

### 浏览 PDM 数据字典

按项目目录集中管理 PDM，在同一工作区查看数据表及其字段明细。

![码熊工作区：浏览 PDM 数据字典](docs/images/workspace-overview.png)

### 搜索表与字段

按表名、描述、注释或字段快速检索，并在结果中高亮匹配内容。

![码熊工作区：搜索表与字段](docs/images/data-search.png)

### AI 助手

使用自然语言查询本地数据字典。AI 功能完全可选，需要配置用户自己的 DeepSeek API Key。

![码熊小码 AI 助手](docs/images/ai-assistant.png)

### 字典中心

统一维护业务字典：手工编辑、Excel 批量导入（字典值列可多选组合唯一值）以及字段绑定查询。

![码熊字典中心](docs/images/dictionary-center.png)

### 导出建表脚本

选择 PDM 或数据表，配置目标数据库参数，预览并下载生成的 DDL。

![码熊：导出数据库建表脚本](docs/images/ddl-export.png)

## 获取与运行

### Windows 绿色版

从 GitHub Releases 下载 `CodeBear-v1.3.0-win-x64.zip`。同名 `.sha256` 文件用于可选的完整性校验：

```powershell
Get-FileHash .\CodeBear-v1.3.0-win-x64.zip -Algorithm SHA256
Get-Content .\CodeBear-v1.3.0-win-x64.zip.sha256
```

确认两处哈希值一致后完整解压 ZIP，双击 `CodeBear.exe`。默认浏览器将打开 `http://127.0.0.1:8765`。

程序只监听 `127.0.0.1`。数据、设置和 PDM 工作副本保存在程序同级的 `data` 目录；发布包本身不包含任何用户数据。

### 从源码运行

要求：Windows 10/11、Python 3.12+、Node.js 20+。

```powershell
git clone https://github.com/Eco1i/CodeBear.git
Set-Location CodeBear
./setup.ps1
./start.ps1
```

也可以双击 `start.bat`。停止服务可在启动窗口按 `Ctrl+C`，或运行 `./stop.ps1`。

## 开发

```powershell
# 安装运行和开发依赖
./setup.ps1
./.venv/Scripts/python.exe -X utf8 -m pip install -r backend/requirements-dev.txt

# 后端测试
./.venv/Scripts/python.exe -X utf8 -m pytest

# 前端类型检查与构建
Set-Location frontend
npm test
npm run build
npm run test:e2e
```

前端开发服务器使用 `npm run dev`，后端开发服务器可在仓库根目录运行：

```powershell
./.venv/Scripts/python.exe -X utf8 -m uvicorn backend.app.main:app --reload
```

测试或源码运行时，可通过 `MAXIONG_APP_DATA_DIR` 指定隔离的数据目录。

## 构建绿色版

```powershell
./build-release.ps1
```

脚本会执行前端构建、PyInstaller 打包、ZIP 与 SHA-256 生成，并在临时目录中完成一次解压启动验收。输出位于 `release/`。

## 数据与隐私

- 码熊只操作导入到工作区的 PDM 副本，不会修改原始 PDM。
- 本地服务无登录机制，只适合绑定 `127.0.0.1`；请勿改为公网或局域网监听。
- PDM 索引、项目副本、对话历史和设置均保存在本机 `data` 目录。
- AI 功能完全可选，需要用户自己的 DeepSeek API Key。
- AI 请求不会上传原始 PDM 文件；会发送问题、最近对话、来源名称，以及本机检索命中的表名、字段名、类型和备注。
- Windows 下保存的 API Key 使用当前用户的 DPAPI 加密，且不会进入 PDM、SQLite 或 `.cbbak`。
- 更新检查只向 GitHub 公共 API 发送匿名 GET 请求（获取最新 Release 元数据），不携带任何本地数据；下载安装包由浏览器直接访问 GitHub 完成。

使用真实业务模型前，请自行确认数据分类、保密要求以及第三方 AI 服务的使用政策。

## 项目结构

```text
backend/      FastAPI、PDM 解析、SQLite 索引与测试
frontend/     React、TypeScript、Ant Design 与 Vite
packaging/    Windows 绿色版构建和验收脚本
.github/      CI、发布工作流和协作模板
```

## 更新记录

版本发布说明见 [CHANGELOG.md](CHANGELOG.md)，Windows 绿色版发行包见 [GitHub Releases](https://github.com/Eco1i/CodeBear/releases)。

## 参与贡献

提交代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中披露漏洞细节。

## 许可证

码熊源码使用 [MIT License](LICENSE)。依赖组件仍遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。“码熊 / CodeBear”的名称和图标可能构成品牌标识；MIT License 不授予商标权。
