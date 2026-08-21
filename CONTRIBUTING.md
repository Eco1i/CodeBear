# 参与贡献

感谢你改进码熊。建议先通过 Issue 说明较大的功能或行为变化，再开始实现。

## 本地环境

- Windows 10/11 x64 或 macOS 13+ arm64
- Python 3.12+
- Node.js 20+

```powershell
./setup.ps1
./.venv/Scripts/python.exe -X utf8 -m pip install -r backend/requirements-dev.txt
./.venv/Scripts/python.exe -X utf8 -m pytest
Set-Location frontend
npm run build
```

macOS 使用 `.venv/bin/python`，其余测试命令相同。平台相关修改必须通过 Windows 与 macOS CI；发布脚本分别生成 Windows ZIP 和 macOS DMG，不得把两个平台的二进制混装到同一发布包。

## 提交要求

- 一个 Pull Request 聚焦一个主题。
- 新功能或缺陷修复需要覆盖相应测试。
- 保持源文件为 UTF-8 无 BOM，避免提交构建产物和本机数据。
- 不得提交真实 PDM、业务截图、数据库、备份包、日志、绝对路径或凭据。
- UI 改动应优先复用现有组件和设计变量，避免同类控件出现不同交互或样式。
- 提交信息建议使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`build:` 等前缀。

提交 Pull Request 前，请确认后端测试和前端构建均通过，并在说明中写明验证方式。
