# ─────────────────────────────────────────────────────────────────────────────
# UnderwriteOS + Heradyne — Railway Deployment Script (Windows PowerShell)
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   Right-click deploy.ps1 → "Run with PowerShell"
#   OR in PowerShell:  .\deploy.ps1
#
# Prerequisites:
#   - Git for Windows  (git-scm.com)
#   - Node.js          (nodejs.org)
#   - Railway account  (railway.app)
#   - Anthropic API key (console.anthropic.com) — optional, AI falls back to rules engine
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ── Colors ───────────────────────────────────────────────────────────────────
function Info    { param($msg) Write-Host "  >> $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "  OK $msg" -ForegroundColor Green }
function Warn    { param($msg) Write-Host "  !! $msg" -ForegroundColor Yellow }
function Fail    { param($msg) Write-Host "  XX $msg" -ForegroundColor Red; exit 1 }
function Divider { Write-Host "`n  ────────────────────────────────────────`n" -ForegroundColor Blue }
function Ask     { param($msg) Write-Host "`n  $msg" -ForegroundColor White; return (Read-Host "  >") }
function AskSecret { param($msg) Write-Host "`n  $msg" -ForegroundColor White; return (Read-Host "  >" -AsSecureString | ConvertFrom-SecureString -AsPlainText) }

Divider
Write-Host "  UnderwriteOS + Heradyne - Railway Deploy" -ForegroundColor White
Write-Host "  This script takes about 10 minutes end to end." -ForegroundColor Gray
Divider

# ── Step 0: Prerequisites ─────────────────────────────────────────────────────
Info "Checking prerequisites..."

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "Git not found. Install from https://git-scm.com then re-run this script."
}
Success "Git found"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js not found. Install from https://nodejs.org then re-run this script."
}
Success "Node.js found"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Info "Installing Railway CLI..."
    npm install -g @railway/cli
    if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
        Fail "Railway CLI install failed. Try running: npm install -g @railway/cli"
    }
}
Success "Railway CLI found"

# ── Step 1: GitHub ────────────────────────────────────────────────────────────
Divider
Write-Host "  Step 1 - Push to GitHub" -ForegroundColor White
Write-Host ""

$is