# Install ClawBuds skill to OpenClaw (CLI already installed via npm)
# Usage: irm https://raw.githubusercontent.com/your-org/clawbuds/main/scripts/install-skill-only.ps1 | iex

$ErrorActionPreference = "Stop"

# Configuration
$GITHUB_REPO = "your-org/clawbuds"  # Replace with actual repository
$BRANCH = "main"
$SKILL_URL = "https://github.com/$GITHUB_REPO/archive/refs/heads/$BRANCH.zip"
$OPENCLAW_DIR = "$env:USERPROFILE\.openclaw"
$SKILLS_DIR = "$OPENCLAW_DIR\skills"

Write-Host "🦞 Installing ClawBuds Skill to OpenClaw" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if OpenClaw is installed
if (-not (Test-Path $OPENCLAW_DIR)) {
    Write-Host "❌ OpenClaw not found at $OPENCLAW_DIR" -ForegroundColor Red
    Write-Host ""
    Write-Host "This script is for OpenClaw users only." -ForegroundColor Yellow
    Write-Host "If you just want the CLI, use: npm install -g clawbuds" -ForegroundColor Yellow
    exit 1
}

# Check if CLI is installed
try {
    $null = Get-Command clawbuds -ErrorAction Stop
} catch {
    Write-Host "⚠️  ClawBuds CLI not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please install the CLI first:" -ForegroundColor Yellow
    Write-Host "  npm install -g clawbuds" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        exit 1
    }
}

# Create skills directory
Write-Host "📁 Creating skills directory..." -ForegroundColor Yellow
if (-not (Test-Path $SKILLS_DIR)) {
    New-Item -ItemType Directory -Path $SKILLS_DIR | Out-Null
}

# Download and extract skill
Write-Host "📥 Downloading ClawBuds skill..." -ForegroundColor Yellow
$TMP_DIR = Join-Path $env:TEMP "clawbuds-install-$(Get-Random)"
New-Item -ItemType Directory -Path $TMP_DIR | Out-Null

try {
    $zipFile = Join-Path $TMP_DIR "clawbuds.zip"

    # Download
    Invoke-WebRequest -Uri $SKILL_URL -OutFile $zipFile

    # Extract
    Expand-Archive -Path $zipFile -DestinationPath $TMP_DIR

    # Find and copy skill directory
    $extractedDir = Get-ChildItem -Path $TMP_DIR -Directory | Where-Object { $_.Name -like "clawbuds-*" } | Select-Object -First 1
    $skillSource = Join-Path $extractedDir.FullName "openclaw-skill\clawbuds"

    if (-not (Test-Path $skillSource)) {
        throw "Skill directory not found in downloaded archive"
    }

    # Install skill
    Write-Host "📋 Installing skill..." -ForegroundColor Yellow
    $skillDest = Join-Path $SKILLS_DIR "clawbuds"
    if (Test-Path $skillDest) {
        Remove-Item -Path $skillDest -Recurse -Force
    }
    Copy-Item -Path $skillSource -Destination $skillDest -Recurse

    Write-Host ""
    Write-Host "✅ ClawBuds skill installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📍 Location: $skillDest" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🚀 Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Make sure you have a ClawBuds server running"
    Write-Host "  2. Run the setup script:"
    Write-Host "     powershell -ExecutionPolicy Bypass -File `$env:USERPROFILE\.openclaw\skills\clawbuds\scripts\setup.ps1 <server-url>"
    Write-Host ""
    Write-Host "📚 Documentation:" -ForegroundColor Cyan
    Write-Host "  https://github.com/$GITHUB_REPO/blob/main/docs/OPENCLAW_QUICKSTART.md"

} catch {
    Write-Host ""
    Write-Host "❌ Installation failed: $_" -ForegroundColor Red
    exit 1
} finally {
    # Cleanup
    if (Test-Path $TMP_DIR) {
        Remove-Item -Path $TMP_DIR -Recurse -Force
    }
}
