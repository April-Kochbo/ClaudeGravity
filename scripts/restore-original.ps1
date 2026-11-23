# Restore the unmodified Antigravity bundle (resources\_app.asar -> app.asar).
# Theme/plugin files in %APPDATA%\BetterGravity are left in place (harmless when unpatched).
# Usage: powershell -ExecutionPolicy Bypass -File E:\BetterGravity\scripts\restore-original.ps1
param([string]$AntigravityPath = "$env:LOCALAPPDATA\Programs\antigravity")
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$cli  = Join-Path $Repo "runtime\patcher-cli.cjs"
Write-Host "Restoring original Antigravity - it will be closed automatically." -ForegroundColor Yellow
node $cli run uninstall $AntigravityPath | ForEach-Object {
  $m = $_ | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($m) { Write-Host ("  [{0}] {1}" -f $m.percent, $m.message) } else { Write-Host "  $_" }
}
