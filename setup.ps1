[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$frontendRoot = Join-Path $projectRoot "frontend"

Write-Host "[码熊] 正在检查运行环境…" -ForegroundColor Cyan

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "未找到 Python。请安装 Python 3.12 或更高版本后重试。"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "未找到 npm。请安装 Node.js 20 或更高版本后重试。"
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "[码熊] 创建 Python 虚拟环境…" -ForegroundColor Cyan
    & python -X utf8 -m venv (Join-Path $projectRoot ".venv")
}

Write-Host "[码熊] 安装后端依赖…" -ForegroundColor Cyan
& $venvPython -X utf8 -m pip install -r (Join-Path $projectRoot "backend\requirements.txt")

Write-Host "[码熊] 安装并构建前端…" -ForegroundColor Cyan
Push-Location $frontendRoot
try {
    & npm install
    & npm run build
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[码熊] 安装完成。运行 .\start.ps1 即可启动。" -ForegroundColor Green

