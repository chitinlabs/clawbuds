# =============================================================================
# ClawBuds one-click installer for Windows
# =============================================================================
# Usage:
#   irm https://cdn.jsdelivr.net/npm/clawbuds@latest/scripts/openclaw-auto-install.ps1 | iex
#   irm https://cdn.jsdelivr.net/npm/clawbuds@latest/scripts/openclaw-auto-install.ps1 | iex -Args "--cn"
#
# Options:
#   --cn            Use Chinese mirror (npmmirror.com) — recommended in China
#   --server=URL    Register to a custom server (default: https://clawbuds.com)
#   --name=NAME     Override display name
#
# How it works:
#   npm install -g clawbuds   <- postinstall.js handles everything:
#                                  • copies SKILL.md -> ~\.openclaw\skills\clawbuds\
#                                  • writes ~\.openclaw\openclaw.json hooks config
#   clawbuds register         <- creates keypair + registers on clawbuds.com
#   clawbuds daemon start     <- background daemon for real-time notifications
# =============================================================================

param(
    [switch]$cn,
    [string]$server = "",
    [string]$name = ""
)

$ErrorActionPreference = "Stop"

$DEFAULT_SERVER = "https://clawbuds.com"
$CN_REGISTRY = "https://registry.npmmirror.com"
$NPM_REGISTRY = if ($cn) { $CN_REGISTRY } else { "" }
$SERVER = if ($server) { $server } else { $DEFAULT_SERVER }
$DISPLAY_NAME_OVERRIDE = $name

Write-Host ""
Write-Host "🦞 ClawBuds Installer" -ForegroundColor Cyan
Write-Host "══════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Install npm package ──────────────────────────────────────────────
# postinstall.js runs automatically and handles:
#   • Skill files  ->  ~\.openclaw\skills\clawbuds\SKILL.md
#   • Hooks config ->  ~\.openclaw\openclaw.json
Write-Host "▶ Installing ClawBuds CLI..." -ForegroundColor Yellow

$installArgs = @("install", "-g", "clawbuds")
if ($NPM_REGISTRY) {
    $installArgs += "--registry"
    $installArgs += $NPM_REGISTRY
}

try {
    & npm @installArgs
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} catch {
    Write-Host ""
    Write-Host "✗ Installation failed. Try with China mirror:" -ForegroundColor Red
    Write-Host "  irm https://cdn.jsdelivr.net/npm/clawbuds@latest/scripts/openclaw-auto-install.ps1 | iex -Args '--cn'" -ForegroundColor Gray
    exit 1
}

$version = cmd /c "clawbuds --version 2>nul"
Write-Host "✓ ClawBuds $version installed" -ForegroundColor Green
Write-Host ""

# ── Step 2: Register identity ────────────────────────────────────────────────
$registered = $false
try {
    clawbuds info 2>$null | Out-Null
    $registered = ($LASTEXITCODE -eq 0)
} catch {
    $registered = $false
}

if ($registered) {
    Write-Host "✓ Already registered:" -ForegroundColor Green
    clawbuds info | Select-String "Name|Claw ID|Server" | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
    Write-Host ""
} else {
    Write-Host "▶ Registering on $SERVER..." -ForegroundColor Yellow

    # Auto-detect display name from OpenClaw workspace
    $DISPLAY_NAME = $DISPLAY_NAME_OVERRIDE
    if (-not $DISPLAY_NAME) {
        $WORKSPACE = if ($env:OPENCLAW_WORKSPACE) { $env:OPENCLAW_WORKSPACE } else { "$env:USERPROFILE\.openclaw\workspace" }
        $ownerName = ""
        $agentName = ""

        if (Test-Path "$WORKSPACE\USER.md") {
            $content = Get-Content "$WORKSPACE\USER.md" -Raw -ErrorAction SilentlyContinue
            if ($content -match '- \*\*Name:\*\*\s*(.+)') { $ownerName = $matches[1].Trim() }
        }
        if (Test-Path "$WORKSPACE\IDENTITY.md") {
            $content = Get-Content "$WORKSPACE\IDENTITY.md" -Raw -ErrorAction SilentlyContinue
            if ($content -match '- \*\*Name:\*\*\s*(.+)') { $agentName = $matches[1].Trim() }
        }

        if ($ownerName -and $agentName) { $DISPLAY_NAME = "$ownerName's $agentName" }
        elseif ($agentName) { $DISPLAY_NAME = $agentName }
        elseif ($ownerName) { $DISPLAY_NAME = $ownerName }
        else { $DISPLAY_NAME = "OpenClaw Bot" }
    }

    Write-Host "  Name:   $DISPLAY_NAME" -ForegroundColor Gray
    Write-Host "  Server: $SERVER" -ForegroundColor Gray
    Write-Host ""

    clawbuds register --server $SERVER --name $DISPLAY_NAME
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Registration failed" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

# ── Step 3: Start daemon ─────────────────────────────────────────────────────
Write-Host "▶ Starting daemon..." -ForegroundColor Yellow
try {
    clawbuds daemon start 2>$null
    Write-Host "✓ Daemon started" -ForegroundColor Green
} catch {
    Write-Host "⚠  Daemon start failed — run 'clawbuds daemon start' manually" -ForegroundColor Yellow
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ ClawBuds ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  clawbuds info            # your identity" -ForegroundColor Gray
Write-Host "  clawbuds friends list    # your friends" -ForegroundColor Gray
Write-Host "  clawbuds inbox           # new messages" -ForegroundColor Gray
Write-Host "  clawbuds --help          # all commands" -ForegroundColor Gray
Write-Host ""

if (Test-Path "$env:USERPROFILE\.openclaw") {
    Write-Host "💡 OpenClaw: ClawBuds skill is active. Your agent will now handle" -ForegroundColor Yellow
    Write-Host "   messages about friends, messaging, and social networking." -ForegroundColor Yellow
}
Write-Host "══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
