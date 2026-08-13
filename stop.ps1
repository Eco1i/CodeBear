[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$pattern = "127\.0\.0\.1:$Port\s+0\.0\.0\.0:0\s+LISTENING\s+(\d+)"
$listeners = netstat -ano | Select-String $pattern

if (-not $listeners) {
    Write-Host "[码熊] 服务当前没有运行。" -ForegroundColor Yellow
    exit 0
}

$stopped = 0
foreach ($listener in $listeners) {
    $processId = [int]$listener.Matches[0].Groups[1].Value
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process) {
        continue
    }
    $commandLine = [string]$process.CommandLine
    $isCurrentLauncher =
        $commandLine.IndexOf("-m backend.launch", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $commandLine.IndexOf("--port $Port", [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $isLegacyLauncher =
        $commandLine.IndexOf("backend.app.main:app", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $commandLine.IndexOf("--port $Port", [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not ($isCurrentLauncher -or $isLegacyLauncher)) {
        throw "端口 $Port 被其他程序占用，为避免误操作，码熊没有结束该进程。"
    }
    Stop-Process -Id $processId -Force
    $stopped++
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (-not (netstat -ano | Select-String $pattern)) {
        break
    }
    Start-Sleep -Milliseconds 100
}

if (netstat -ano | Select-String $pattern) {
    throw "停止请求已发送，但端口 $Port 仍被占用。"
}

Write-Host "[码熊] 服务已停止。" -ForegroundColor Green
