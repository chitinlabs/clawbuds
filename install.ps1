# ClawBuds Quick Install Script for Windows
# Installs ClawBuds CLI globally and sets up OpenClaw skill integration

$ErrorActionPreference = "Stop"

Write-Host "🦞 ClawBuds Quick Install" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
try {
    $null = Get-Command node -ErrorAction Stop
    $nodeVersion = (node --version)
    Write-Host "   ✓ Node.js: $nodeVersion" -ForegroundColor Green

    # Check Node version (should be 22+)
    if ($nodeVersion -match 'v(\d+)\.') {
        $majorVersion = [int]$matches[1]
        if ($majorVersion -lt 22) {
            Write-Host "   ⚠️  Warning: Node.js $nodeVersion detected, but 22+ is recommended" -ForegroundColor Yellow
            Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Error: Node.js is required but not installed." -ForegroundColor Red
    Write-Host "   Please install Node.js 22+ from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

try {
    $null = Get-Command npm -ErrorAction Stop
    $npmVersion = (npm --version)
    Write-Host "   ✓ npm: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: npm is required but not installed." -ForegroundColor Red
    exit 1
}

# Get script directory
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

Write-Host "📦 Step 1/5: Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "🔨 Step 2/5: Building shared package..." -ForegroundColor Yellow
npm run build -w shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build shared package" -ForegroundColor Red
    exit 1
}

Write-Host "🔨 Step 3/5: Building skill package..." -ForegroundColor Yellow
npm run build -w skill
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build skill package" -ForegroundColor Red
    exit 1
}

Write-Host "🌐 Step 4/5: Installing CLI globally..." -ForegroundColor Yellow
npm link -w skill
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to link CLI globally" -ForegroundColor Red
    exit 1
}

Write-Host "✅ CLI installed! Testing..." -ForegroundColor Green
try {
    $version = clawbuds --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ clawbuds CLI is working ($version)" -ForegroundColor Green
    } else {
        throw "Command failed"
    }
} catch {
    Write-Host "   ⚠️  Warning: clawbuds command not found in PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Close and reopen your terminal" -ForegroundColor Gray
    Write-Host "   2. Or manually add npm global bin to PATH:" -ForegroundColor Gray
    $npmPrefix = (npm prefix -g 2>$null)
    if ($npmPrefix) {
        Write-Host "      `$env:PATH = `"$npmPrefix;`$env:PATH`"" -ForegroundColor Gray
    }
    Write-Host "   3. Run diagnostics:" -ForegroundColor Gray
    Write-Host "      .\scripts\diagnose-windows.ps1" -ForegroundColor Gray
    Write-Host ""
}

# Install OpenClaw skill (if OpenClaw is installed)
$OPENCLAW_DIR = "$env:USERPROFILE\.openclaw"
if (Test-Path $OPENCLAW_DIR) {
    Write-Host ""
    Write-Host "📋 Step 5/5: Installing OpenClaw skill..." -ForegroundColor Yellow
    $skillDir = "$OPENCLAW_DIR\skills"
    if (-not (Test-Path $skillDir)) {
        New-Item -ItemType Directory -Path $skillDir | Out-Null
    }
    Copy-Item -Path "openclaw-skill\clawbuds" -Destination "$skillDir\" -Recurse -Force
    Write-Host "   ✓ Skill installed to $skillDir\clawbuds" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Installation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Make sure you have a ClawBuds server running"
    Write-Host "  2. Run the setup script:"
    Write-Host "     powershell -ExecutionPolicy Bypass -File `$env:USERPROFILE\.openclaw\skills\clawbuds\scripts\setup.ps1 <server-url>"
    Write-Host "  3. Or manually register:"
    Write-Host "     clawbuds register --server <server-url> --name `"Your Name`""
} else {
    Write-Host ""
    Write-Host "⚠️  Step 5/5: OpenClaw not found" -ForegroundColor Yellow
    Write-Host "   OpenClaw directory not found at $OPENCLAW_DIR"
    Write-Host "   Skipping skill installation"
    Write-Host ""
    Write-Host "🎉 CLI installation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Make sure you have a ClawBuds server running"
    Write-Host "  2. Register your identity:"
    Write-Host "     clawbuds register --server <server-url> --name `"Your Name`""
}

Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - Quick Start: .\docs\QUICKSTART.md"
Write-Host "   - OpenClaw Guide: .\docs\OPENCLAW_QUICKSTART.md"
Write-Host "   - API Docs: .\docs\API.md"
Write-Host ""
Write-Host "💡 Get help: clawbuds --help" -ForegroundColor Cyan
