# CodeBear — PowerDesigner PDM Tool

[中文说明](README.zh-CN.md) · **English**

![CodeBear icon](frontend/public/codebear-icon-v3.png)

> Open your PowerDesigner PDM files, find the table or field you need, keep data dictionaries and table relationships up to date, and export DDL—all in one local desktop app.

[![Latest Release](https://img.shields.io/github/v/release/Eco1i/CodeBear?display_name=tag&sort=semver)](https://github.com/Eco1i/CodeBear/releases)
[![License](https://img.shields.io/github/license/Eco1i/CodeBear)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Eco1i/CodeBear)](https://github.com/Eco1i/CodeBear/stargazers)

If you work with PowerDesigner, CodeBear gives you a faster way to look through PDM files and keep their documentation in order. Search tables and fields, maintain business dictionaries and relationships, and export database scripts without leaving your local workspace.

- **Latest stable version:** `v1.5.16`
- **Supported systems:** Windows 10/11 x64 and macOS 13+ Apple Silicon
- **Privacy:** CodeBear runs locally. The optional AI assistant sends your question, recent conversation, and the retrieved project/PDM paths plus table/field metadata to DeepSeek; complete PDM files stay local.

## 10-second overview

![CodeBear 10-second demo: browse PDM, search fields, manage dictionaries, view relationships, and export DDL](docs/images/codebear-demo.en.gif)

## Features

- Manage `.pdm` files by project and directory.
- Browse tables, fields, primary keys, data types, comments, and descriptions.
- Open multiple table details in tabs while keeping each table's editing draft.
- Search tables and fields by name, description, comment, or column content.
- Edit table names, codes, descriptions, and field definitions.
- Automatically back up PDM files before structural changes.
- Use the recycle bin and migrate backups between installations.
- Import business dictionaries from Excel and bind dictionary entries to fields.
- Parse PDM foreign-key relationships and maintain additional manual relationships.
- Explore table relationships in both list and graph views.
- Generate DDL for MySQL, Oracle, Dameng, TDSQL MySQL, and Apache Ignite.
- Optionally ask questions about your local data dictionary with the DeepSeek AI assistant.

## Screenshots

### Browse a PDM data dictionary

Organize PDM projects and inspect tables and field details in one workspace.

![CodeBear workspace](docs/images/workspace-overview.png)

### Search tables and fields

Find matching tables, columns, descriptions, and comments with highlighted results.

![CodeBear data search](docs/images/data-search.png)

### Data dictionary center

Maintain business dictionaries manually or import values from Excel, then bind them to fields.

![CodeBear dictionary center](docs/images/dictionary-center.png)

### Table relationships

Review relationships parsed from PDM foreign keys or maintained manually.

![CodeBear table relationships](docs/images/table-relations.png)

### DDL export

Select a PDM or table, configure the target database, preview the script, and download it.

![CodeBear DDL export](docs/images/ddl-export.png)

### Optional AI assistant

Ask natural-language questions about the tables and fields in your local data dictionary.

![CodeBear AI assistant](docs/images/ai-assistant.png)

## Download

Download the latest release packages from [GitHub Releases](https://github.com/Eco1i/CodeBear/releases).

| Platform | Package |
| --- | --- |
| Windows 10/11 x64 | `CodeBear-v1.5.16-win-x64.zip` |
| macOS 13+ Apple Silicon | `CodeBear-v1.5.16-mac-arm64.dmg` |

The Windows and macOS packages are independent. The macOS build currently supports Apple Silicon only and does not support Intel Macs.

## Quick start

### Windows

1. Download and extract the ZIP package.
2. Double-click `CodeBear.exe`.
3. The application opens in your browser.

Windows data is stored in the `data` directory beside the application. For an upgrade, extract the new version into a new directory and use **备份迁移（Backup Migration）** to import existing data.

### macOS

1. Open the DMG image.
2. Drag `CodeBear.app` to **Applications**.
3. Launch CodeBear from Finder.

The current macOS build is not notarized. On first launch, right-click `CodeBear.app` in Finder and choose **Open**. If macOS still blocks it, use **System Settings > Privacy & Security > Open Anyway**.

macOS data is stored in `~/Library/Application Support/CodeBear`. Replacing the application does not remove existing data.

## Privacy and AI

- CodeBear runs locally and does not expose a service to your LAN or the public internet.
- CodeBear works on a copy of imported PDM files and does not modify the original PDM.
- The optional AI assistant requires your own DeepSeek API key.
- When you ask the AI assistant a question, your question, recent conversation, and the retrieved project/PDM paths plus table/field metadata are sent to DeepSeek; the complete PDM file is not uploaded.
- An API key saved through the app settings is encrypted for the current system account; macOS uses the login Keychain. You can also provide `DEEPSEEK_API_KEY` as an environment variable.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, testing, cross-platform requirements, and contribution guidelines.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) and the [release notes](docs/releases) for changes in each version.

## License

CodeBear is released under the [MIT License](LICENSE).
