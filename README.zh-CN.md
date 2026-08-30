# 码熊 CodeBear：PowerDesigner PDM 工具

**中文** · [English](README.md)

![码熊图标](frontend/public/codebear-icon-v3.png)

> 打开 PowerDesigner PDM 文件，快速找到需要的表和字段，维护业务字典和表关系，并导出建表脚本——这些工作都可以在本机完成。

[![最新版本](https://img.shields.io/github/v/release/Eco1i/CodeBear?display_name=tag&sort=semver)](https://github.com/Eco1i/CodeBear/releases)
[![许可证](https://img.shields.io/github/license/Eco1i/CodeBear)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Eco1i/CodeBear)](https://github.com/Eco1i/CodeBear/stargazers)

如果你经常用 PowerDesigner 做数据库设计，码熊可以帮你更快查表、查字段，也方便整理和维护 PDM 里的数据字典。

- **当前稳定版本：** `v1.5.16`
- **支持系统：** Windows 10/11 x64 与 macOS 13+ Apple Silicon
- **隐私说明：** 码熊在本机运行。使用可选的 AI 助手时，你的问题、近期对话以及检索到的项目/PDM 路径和表/字段元数据会发送给 DeepSeek；完整 PDM 文件不会上传。

## 10 秒功能演示

![码熊 10 秒演示：浏览 PDM、搜索字段、维护字典、查看关系和导出建表脚本](docs/images/codebear-demo.gif)

## 主要功能

- 按项目和目录管理 `.pdm` 文件。
- 浏览数据表、字段、主键、数据类型、备注和描述。
- 表详情支持多标签浏览，同时保留各表的编辑草稿。
- 按表名、描述、注释或字段内容快速搜索。
- 编辑表名称、代码、描述和字段定义。
- 结构变更前自动备份 PDM 文件。
- 支持回收站和备份迁移。
- 从 Excel 导入业务字典，并将字典绑定到字段。
- 自动解析 PDM 外键关系，也可以手工维护其他表关系。
- 通过列表或关系图查看表关系。
- 生成 MySQL、Oracle、达梦、TDSQL MySQL 版和 Apache Ignite 建表脚本。
- 可选接入 DeepSeek AI 助手，通过自然语言查询本地数据字典。

## 界面预览

### 浏览 PDM 数据字典

按项目目录集中管理 PDM，在同一工作区查看数据表及其字段明细。

![码熊工作区：浏览 PDM 数据字典](docs/images/workspace-overview.png)

### 搜索表与字段

按表名、描述、注释或字段快速检索，并在结果中高亮匹配内容。

![码熊工作区：搜索表与字段](docs/images/data-search.png)

### 字典中心

统一维护业务字典：手工编辑、Excel 批量导入以及字段绑定查询。

![码熊字典中心](docs/images/dictionary-center.png)

### 表关系

查看从 PDM 外键解析出的关系，也可以维护手工补充的表关系。

![码熊：表关系浏览](docs/images/table-relations.png)

### 导出建表脚本

选择 PDM 或数据表，配置目标数据库参数，预览并下载生成的 DDL。

![码熊：导出数据库建表脚本](docs/images/ddl-export.png)

### 可选的 AI 助手

用自然语言询问本地数据字典中的数据表和字段。

![码熊 AI 助手](docs/images/ai-assistant.png)

## 下载

请前往 [GitHub Releases](https://github.com/Eco1i/CodeBear/releases) 下载最新版本。

| 平台 | 安装包 |
| --- | --- |
| Windows 10/11 x64 | `CodeBear-v1.5.16-win-x64.zip` |
| macOS 13+ Apple Silicon | `CodeBear-v1.5.16-mac-arm64.dmg` |

Windows 和 macOS 是两个独立安装包，请按自己的系统选择。当前 Mac 版只支持 Apple Silicon（M 系列芯片），暂不支持 Intel Mac。

## 快速开始

### Windows

1. 下载并完整解压 ZIP 安装包。
2. 双击 `CodeBear.exe`。
3. 程序启动后会自动打开浏览器。

Windows 数据保存在程序同级的 `data` 目录。升级时建议把新版本解压到新目录，再通过“备份迁移”导入旧版数据。

### macOS

1. 打开 DMG 文件。
2. 将 `CodeBear.app` 拖入“应用程序”。
3. 在 Finder 中启动码熊。

当前版本未经过 Apple 公证。首次启动时，请在 Finder 中右键 `CodeBear.app`，选择“打开”；如果系统仍然拦截，请前往“系统设置 > 隐私与安全性”选择“仍要打开”。

macOS 数据保存在 `~/Library/Application Support/CodeBear`。替换应用不会删除原有数据。

## 数据与隐私

- 码熊在本机运行，不会向局域网或公网开放服务。
- 码熊只操作导入到工作区的 PDM 副本，不会修改原始 PDM。
- AI 助手完全可选，需要配置你自己的 DeepSeek API Key。
- 使用 AI 提问时，你的问题、近期对话以及检索到的项目/PDM 路径和表/字段元数据会发送给 DeepSeek，但不会上传完整 PDM 文件。
- 通过应用设置保存的 API Key 会按当前系统账户加密保存；macOS 使用登录钥匙串。也可以通过环境变量 `DEEPSEEK_API_KEY` 配置。

## 开发与贡献

开发环境、测试命令、跨平台要求和贡献方式请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 更新记录

版本变更请参阅 [CHANGELOG.md](CHANGELOG.md) 和 [发行说明](docs/releases)。

## 许可证

码熊使用 [MIT License](LICENSE) 开源。
