# BetterGravity Claude Workspace - install / sync (portable)
# Usage (run from any PowerShell window, NOT from inside Antigravity):
#   powershell -ExecutionPolicy Bypass -File E:\BetterGravity\scripts\install-or-sync.ps1
#   ... -SyncOnly        copy theme/plugin + settings only, do not touch app.asar
#   ... -AntigravityPath "D:\Apps\antigravity"   custom install location
# Requires Node.js (for the BetterGravity patcher CLI) only when patching.
param(
  [switch]$SyncOnly,
  [string]$AntigravityPath = "$env:LOCALAPPDATA\Programs\antigravity"
)
$ErrorActionPreference = "Stop"
$Repo    = Split-Path -Parent $PSScriptRoot
$Content = Join-Path $env:APPDATA "BetterGravity"
$Theme   = "claude-warm-serif.css"
$Plugin  = "claude-code-workspace"

Write-Host "== BetterGravity Claude Workspace ==" -ForegroundColor Cyan
Write-Host "Repo:        $Repo"
Write-Host "Content dir: $Content"

# 1) Patch host (idempotent)
if (-not $SyncOnly) {
  if (-not (Test-Path (Join-Path $AntigravityPath "Antigravity.exe"))) { throw "Antigravity.exe not found in $AntigravityPath" }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is required for patching. Install Node or use -SyncOnly." }
  $cli = Join-Path $Repo "runtime\patcher-cli.cjs"
  $rt  = Join-Path $Repo "runtime\runtime"
  $info = (node $cli inspect $AntigravityPath) | ConvertFrom-Json
  $st = $info.installation.patchState
  Write-Host "Antigravity $($info.installation.antigravityVersion) - patch state: $st"
  if ($st -ne "patched") {
    $op = if ($st -eq "unpatched") { "install" } else { "repair" }
    Write-Host "Running '$op' - Antigravity will be closed automatically." -ForegroundColor Yellow
    node $cli run $op $AntigravityPath $rt | ForEach-Object {
      $m = $_ | ConvertFrom-Json -ErrorAction SilentlyContinue
      if ($m) { Write-Host ("  [{0}] {1}" -f $m.percent, $m.message) } else { Write-Host "  $_" }
    }
    $after = ((node $cli inspect $AntigravityPath) | ConvertFrom-Json).installation.patchState
    if ($after -ne "patched") { throw "Patch verification failed (state: $after). Original bundle kept in resources\_app.asar." }
  }
}

# 2) Sync theme + plugin + fonts
New-Item -ItemType Directory -Force -Path (Join-Path $Content "themes"), (Join-Path $Content "plugins"), (Join-Path $Content "fonts"), (Join-Path $Content "themes\fonts") | Out-Null
Copy-Item (Join-Path $Repo "themes\$Theme") (Join-Path $Content "themes\$Theme") -Force
if (Test-Path (Join-Path $Repo "fonts")) {
  Copy-Item (Join-Path $Repo "fonts\*") (Join-Path $Content "fonts") -Recurse -Force
  Copy-Item (Join-Path $Repo "fonts\*") (Join-Path $Content "themes\fonts") -Recurse -Force
}
$dst = Join-Path $Content "plugins\$Plugin"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item (Join-Path $Repo "plugins\$Plugin") $dst -Recurse -Force
Write-Host "Synced theme '$Theme', plugin '$Plugin', and local fonts."

# 3) Enable them in settings.json (merge, keep user's other entries)
$settingsPath = Join-Path $Content "settings.json"
if (Test-Path $settingsPath) { $s = ([System.IO.File]::ReadAllText($settingsPath)).TrimStart([char]0xFEFF) | ConvertFrom-Json }
else { $s = [pscustomobject]@{ schemaVersion = 1; themes = [pscustomobject]@{ enabled = @() }; plugins = [pscustomobject]@{ developerMode = $false; enabled = @() }; reapplyAfterHostUpdate = $true } }
$s.themes.enabled  = @(@($s.themes.enabled)  + $Theme  | Where-Object { $_ } | Select-Object -Unique)
$s.plugins.enabled = @(@($s.plugins.enabled) + $Plugin | Where-Object { $_ } | Select-Object -Unique)
$s.plugins.developerMode = $true   # BetterGravity only loads local plugin folders in developer mode
$s.reapplyAfterHostUpdate = $true
# Must be UTF-8 WITHOUT BOM: Windows PowerShell 5 "-Encoding UTF8" adds a BOM and BetterGravity's JSON.parse rejects it.
[System.IO.File]::WriteAllText($settingsPath, ($s | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "settings.json updated (developerMode on, theme + plugin enabled)."

Write-Host "Done. Start Antigravity to see the Claude workspace." -ForegroundColor Green
