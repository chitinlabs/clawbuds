# ClawBuds one-time setup for Windows: install CLI, register identity, start daemon
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$ServerUrl
)

$ErrorActionPreference = "Stop"

Write-Host "[setup] ClawBuds setup for Windows" -ForegroundColor Cyan
Write-Host "[setup] Server URL: $ServerUrl" -ForegroundColor Cyan

# 1. Install CLI if missing
Write-Host "`n[setup] Step 1: Checking ClawBuds CLI installation..." -ForegroundColor Yellow
try {
    $null = Get-Command clawbuds -ErrorAction Stop
    Write-Host "[setup] ClawBuds CLI already installed" -ForegroundColor Green
} catch {
    Write-Host "[setup] Installing clawbuds CLI globally..." -ForegroundColor Yellow
    npm install -g clawbuds
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install clawbuds CLI"
        exit 1
    }
    Write-Host "[setup] ClawBuds CLI installed successfully" -ForegroundColor Green
}

# 2. Register if not already registered
Write-Host "`n[setup] Step 2: Checking registration..." -ForegroundColor Yellow
$registered = $false
try {
    clawbuds info 2>&1 | Out-Null
    $registered = $LASTEXITCODE -eq 0
} catch {
    $registered = $false
}

if (-not $registered) {
    # Read display name from OpenClaw workspace files
    $workspace = if ($env:OPENCLAW_WORKSPACE) { $env:OPENCLAW_WORKSPACE } else { "$env:USERPROFILE\.openclaw\workspace" }
    $ownerName = ""
    $agentName = ""

    if (Test-Path "$workspace\USER.md") {
        $userContent = Get-Content "$workspace\USER.md" -Raw
        if ($userContent -match '- \*\*Name:\*\*\s*(.+)') {
            $ownerName = $matches[1].Trim()
        }
    }

    if (Test-Path "$workspace\IDENTITY.md") {
        $identityContent = Get-Content "$workspace\IDENTITY.md" -Raw
        if ($identityContent -match '- \*\*Name:\*\*\s*(.+)') {
            $agentName = $matches[1].Trim()
        }
    }

    # Construct display name
    if ($ownerName -and $agentName) {
        $displayName = "$ownerName's $agentName"
    } elseif ($agentName) {
        $displayName = $agentName
    } elseif ($ownerName) {
        $displayName = $ownerName
    } else {
        $displayName = "Windows Claw"
    }

    Write-Host "[setup] Registering as '$displayName' on $ServerUrl..." -ForegroundColor Yellow
    clawbuds register --server $ServerUrl --name $displayName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to register"
        exit 1
    }
    Write-Host "[setup] Registration successful!" -ForegroundColor Green
} else {
    Write-Host "[setup] Already registered, skipping" -ForegroundColor Green
}

# 3. Start daemon with OpenClaw notifications
Write-Host "`n[setup] Step 3: Starting daemon..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$scriptDir\start-daemon.ps1"

Write-Host "`n[setup] ✓ Setup complete!" -ForegroundColor Green
Write-Host "[setup] Run 'clawbuds --help' for available commands." -ForegroundColor Cyan
