# BetterGravity Claude Workspace

Makes Antigravity 2.x look and behave like the Claude Code Desktop app (3 columns, warm cream + terracotta, serif type).

## Install / migrate to another PC
1. Copy the whole `BetterGravity` folder to the new machine (any drive).
2. Close Antigravity, then in a normal PowerShell window run:
   `powershell -ExecutionPolicy Bypass -File <path>\BetterGravity\scripts\install-or-sync.ps1`
   (Node.js is required to patch the app.)
3. After an Antigravity auto-update, run the same command again.
4. After editing a theme or plugin, run it with `-SyncOnly`.

## Uninstall
`scripts\restore-original.ps1` puts the original `app.asar` back. BetterGravity also keeps up to 5 snapshots in `resources\`.

## Layout
- `themes/claude-warm-serif.css`: colour, font and component theme
- `plugins/claude-code-workspace/`: 3-column shell, cards, status bar, Overview / Thread Inspector
- `runtime/`: BetterGravity v3.0.0 patcher and runtime (bundled so it works offline)
- `docs/`: spec baseline and milestone reports

## M4/M5
Thread Inspector reads live data from the open session; see [docs/04-Spec-M4-Inspector.md](docs/04-Spec-M4-Inspector.md).
