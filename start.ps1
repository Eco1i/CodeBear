[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$frontendIndex = Join-Path $projectRoot "frontend\dist\index.html"

if (-not (Test-Path -LiteralPath $venvPython) -or -not (Test-Path -LiteralPath $frontendIndex)) {
    throw "码熊尚未安装。请先在当前目录运行 .\setup.ps1。"
}

$serverUrl = "http://127.0.0.1:$Port"
$arguments = @("-X", "utf8", "-m", "backend.launch", "--host", "127.0.0.1", "--port", "$Port")
if ($NoBrowser) {
    $arguments += "--no-browser"
}

Write-Host "[码熊] 正在启动：$serverUrl" -ForegroundColor Green
Write-Host "[码熊] 按 Ctrl+C 或关闭本窗口即可停止。" -ForegroundColor Cyan
Write-Host "[码熊] 也可以双击 stop.bat 停止服务。" -ForegroundColor DarkGray

Push-Location $projectRoot
try {
    & $venvPython @arguments
}
finally {
    Pop-Location
    Write-Host "[码熊] 服务已停止。" -ForegroundColor Yellow
}
