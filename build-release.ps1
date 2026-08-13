$ErrorActionPreference = "Stop"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (Test-Path -LiteralPath $python) {
    & $python -X utf8 (Join-Path $PSScriptRoot "packaging\build_release.py") @args
} else {
    python -X utf8 (Join-Path $PSScriptRoot "packaging\build_release.py") @args
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
