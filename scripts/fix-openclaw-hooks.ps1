# ClawBuds OpenClaw Hooks Auto-Fix for Windows
# Configures OpenClaw hooks for ClawBuds integration

$ErrorActionPreference = "Stop"

Write-Host "ClawBuds OpenClaw Hooks Auto-Fix" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check OpenClaw
if (-not (Test-Path "$env:USERPROFILE\.openclaw")) {
    Write-Host "ERROR: OpenClaw not installed (~/.openclaw does not exist)" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] OpenClaw installed" -ForegroundColor Green

# 2. Check ClawBuds CLI
try {
    $null = Get-Command clawbuds -ErrorAction Stop
    Write-Host "[OK] ClawBuds CLI installed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: ClawBuds CLI not installed" -ForegroundColor Red
    Write-Host "   Run: npm install -g clawbuds" -ForegroundColor Yellow
    exit 1
}

# 3. Generate or read token
$CONFIG_FILE = "$env:USERPROFILE\.openclaw\openclaw.json"

if ((Test-Path $CONFIG_FILE) -and (Select-String -Path $CONFIG_FILE -Pattern '"token"' -Quiet)) {
    try {
        $config = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
        $TOKEN = $config.hooks.token
        Write-Host "[OK] Using existing token: $($TOKEN.Substring(0, 16))..." -ForegroundColor Green

        # Ensure allowRequestSessionKey is set
        if (-not $config.hooks.allowRequestSessionKey) {
            Write-Host "[INFO] Adding allowRequestSessionKey to config..." -ForegroundColor Cyan
            $config.hooks | Add-Member -MemberType NoteProperty -Name allowRequestSessionKey -Value $true -Force
            $config | ConvertTo-Json -Depth 10 | Set-Content -Path $CONFIG_FILE -NoNewline
        }

        # Remove allowedSessionKeyPrefixes if it exists (no longer needed with hook: prefix)
        if ($config.hooks.PSObject.Properties.Name -contains 'allowedSessionKeyPrefixes') {
            $prefixes = $config.hooks.allowedSessionKeyPrefixes
            if ($prefixes -contains 'clawbuds-') {
                Write-Host "[INFO] Removing allowedSessionKeyPrefixes (now using hook:clawbuds-* prefix)" -ForegroundColor Cyan
                $config.hooks.PSObject.Properties.Remove('allowedSessionKeyPrefixes')
                $config | ConvertTo-Json -Depth 10 | Set-Content -Path $CONFIG_FILE -NoNewline
            }
        }
    } catch {
        Write-Host "ERROR: Failed to parse config: $_" -ForegroundColor Red
        exit 1
    }
} else {
    # Generate random hex token (32 characters)
    $bytes = New-Object Byte[] 16
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $TOKEN = "clawbuds-hook-" + ($bytes | ForEach-Object { $_.ToString("x2") }) -join ''

    if (-not (Test-Path "$env:USERPROFILE\.openclaw")) {
        New-Item -ItemType Directory -Path "$env:USERPROFILE\.openclaw" | Out-Null
    }

    $configJson = @"
{
  "hooks": {
    "enabled": true,
    "token": "$TOKEN",
    "allowRequestSessionKey": true
  }
}
"@

    $configJson | Set-Content -Path $CONFIG_FILE -NoNewline
    Write-Host "[OK] Generated new token: $($TOKEN.Substring(0, 16))..." -ForegroundColor Green
    Write-Host "[INFO] Using hook:clawbuds-* prefix (compatible with OpenClaw defaults)" -ForegroundColor Cyan
}

# 4. Stop existing daemon
$configDir = if ($env:CLAWBUDS_CONFIG_DIR) { $env:CLAWBUDS_CONFIG_DIR } else { "$env:USERPROFILE\.clawbuds" }
$pidFile = "$configDir\daemon.pid"

if (Test-Path $pidFile) {
    $PID = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($PID) {
        try {
            $process = Get-Process -Id $PID -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "[INFO] Stopping existing daemon (PID: $PID)..." -ForegroundColor Cyan
                Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
            }
        } catch {
            # Process not found, continue
        }
    }
}

# 5. Start daemon
Write-Host "[INFO] Starting daemon..." -ForegroundColor Cyan

# Ensure config directory exists
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

# Find clawbuds-daemon executable
$daemonCmd = $null
try {
    $daemonCmd = (Get-Command clawbuds-daemon -ErrorAction SilentlyContinue).Source
} catch {}

if (-not $daemonCmd) {
    try {
        $npmPrefix = (npm prefix -g 2>$null).Trim()
        $daemonCmd = Join-Path $npmPrefix "node_modules\.bin\clawbuds-daemon.cmd"
        if (-not (Test-Path $daemonCmd)) {
            $daemonCmd = Join-Path $npmPrefix "node_modules\.bin\clawbuds-daemon"
        }
        if (-not (Test-Path $daemonCmd)) {
            $daemonCmd = $null
        }
    } catch {}
}

if (-not $daemonCmd) {
    Write-Host "ERROR: clawbuds-daemon not found" -ForegroundColor Red
    Write-Host "   Run: npm install -g clawbuds" -ForegroundColor Yellow
    exit 1
}

# Read token from config
$config = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
$env:OPENCLAW_HOOKS_TOKEN = $config.hooks.token

$logFile = "$configDir\daemon.log"

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "node"
$startInfo.Arguments = "`"$daemonCmd`""
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true
$startInfo.WorkingDirectory = $configDir
$startInfo.EnvironmentVariables["OPENCLAW_HOOKS_TOKEN"] = $env:OPENCLAW_HOOKS_TOKEN

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo

# Redirect output to log file
$outputHandler = {
    param($sender, $e)
    if (-not [string]::IsNullOrEmpty($e.Data)) {
        Add-Content -Path $logFile -Value $e.Data
    }
}

$process.add_OutputDataReceived($outputHandler)
$process.add_ErrorDataReceived($outputHandler)

try {
    $process.Start() | Out-Null
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    $DAEMON_PID = $process.Id
    Set-Content -Path $pidFile -Value $DAEMON_PID

    Write-Host "[OK] Daemon started (PID: $DAEMON_PID)" -ForegroundColor Green

    # 6. Verify
    Start-Sleep -Seconds 2
    if (Test-Path $logFile) {
        Write-Host ""
        Write-Host "Daemon log (last 10 lines):" -ForegroundColor White
        Write-Host "----------------------------" -ForegroundColor Gray
        Get-Content $logFile -Tail 10
    }

    Write-Host ""
    Write-Host "Configuration complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. View real-time log: Get-Content $logFile -Tail 20 -Wait" -ForegroundColor Gray
    Write-Host "  2. Check status: clawbuds daemon status" -ForegroundColor Gray
    Write-Host "  3. Test message notifications" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: Failed to start daemon: $_" -ForegroundColor Red
    exit 1
}
