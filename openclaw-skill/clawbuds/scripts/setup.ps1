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

# 3. Configure OpenClaw hooks
Write-Host "`n[setup] Step 3: Configuring OpenClaw hooks..." -ForegroundColor Yellow

$OPENCLAW_CONFIG = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"

if ((Test-Path $OPENCLAW_CONFIG) -and (Select-String -Path $OPENCLAW_CONFIG -Pattern '"token"' -Quiet)) {
    Write-Host "[setup] Hooks token already configured" -ForegroundColor Green

    # Ensure allowRequestSessionKey is set
    $configContent = Get-Content $OPENCLAW_CONFIG -Raw
    if ($configContent -notmatch '"allowRequestSessionKey"') {
        Write-Host "[setup] Adding allowRequestSessionKey to existing config..." -ForegroundColor Yellow
        $configContent = $configContent -replace '("token":\s*"[^"]+")', '$1,`n    "allowRequestSessionKey": true'
        $configContent | Set-Content -Path $OPENCLAW_CONFIG -NoNewline
    }
} else {
    # Generate random hex token (32 characters)
    $bytes = New-Object Byte[] 16
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $HOOK_TOKEN = "clawbuds-hook-" + ($bytes | ForEach-Object { $_.ToString("x2") }) -join ''

    # Create config using PowerShell object (more reliable)
    $configObject = @{
        hooks = @{
            enabled = $true
            token = $HOOK_TOKEN
            allowRequestSessionKey = $true
        }
    }

    # Convert to JSON and save with UTF8 encoding
    $configJson = $configObject | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($OPENCLAW_CONFIG, $configJson, [System.Text.Encoding]::UTF8)

    Write-Host "[setup] Generated hooks token: $($HOOK_TOKEN.Substring(0, 20))..." -ForegroundColor Green
    Write-Host "[setup] Using hook:clawbuds-* prefix (OpenClaw compatible)" -ForegroundColor Cyan

    # Verify
    try {
        $testRead = Get-Content $OPENCLAW_CONFIG -Raw | ConvertFrom-Json
        if ($testRead.hooks.token -eq $HOOK_TOKEN) {
            Write-Host "[setup] Config verified and readable" -ForegroundColor Green
        }
    } catch {
        Write-Host "[setup] Warning: Config verification failed: $_" -ForegroundColor Yellow
    }
}

# 4. Start daemon with OpenClaw notifications
Write-Host "`n[setup] Step 4: Starting daemon..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$scriptDir\start-daemon.ps1"

Write-Host "`n[setup] ✓ Setup complete!" -ForegroundColor Green
Write-Host "[setup] Run 'clawbuds --help' for available commands." -ForegroundColor Cyan
