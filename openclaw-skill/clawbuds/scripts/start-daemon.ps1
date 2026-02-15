# Start clawbuds-daemon with OpenClaw hooks integration
# Config priority: .env file -> environment -> defaults

$ErrorActionPreference = "Stop"

$configDir = if ($env:CLAWBUDS_CONFIG_DIR) { $env:CLAWBUDS_CONFIG_DIR } else { "$env:USERPROFILE\.clawbuds" }
$envFile = "$configDir\.env"
$openclawConfig = "$env:USERPROFILE\.openclaw\openclaw.json"
$pidFile = "$configDir\daemon.pid"
$logFile = "$configDir\daemon.log"

# Load .env if exists
if (Test-Path $envFile) {
    Write-Host "[daemon] Loading config from $envFile" -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

# Kill existing daemon if running
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
        try {
            $process = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "[daemon] Stopping existing daemon (PID: $oldPid)..." -ForegroundColor Yellow
                Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
            }
        } catch {
            # Process not found, continue
        }
    }
}

# Read hooks token from openclaw.json (if not already set via .env)
if (-not $env:OPENCLAW_HOOKS_TOKEN -and (Test-Path $openclawConfig)) {
    try {
        $cfg = Get-Content $openclawConfig -Raw | ConvertFrom-Json
        if ($cfg.hooks.token) {
            $env:OPENCLAW_HOOKS_TOKEN = $cfg.hooks.token
        }
    } catch {
        # Config not readable, continue
    }
}

# Check if OpenClaw hooks are configured
if (-not $env:OPENCLAW_HOOKS_TOKEN) {
    Write-Host ""
    Write-Host "[daemon] OpenClaw hooks not configured — real-time notifications will be disabled." -ForegroundColor Yellow
    Write-Host "[daemon] To enable, either:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Add hooks.token to $env:USERPROFILE\.openclaw\openclaw.json:" -ForegroundColor White
    Write-Host '     "hooks": { "enabled": true, "token": "your-secret" }' -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Or create $envFile with:" -ForegroundColor White
    Write-Host '     OPENCLAW_HOOKS_TOKEN=your-secret' -ForegroundColor Gray
    Write-Host ""
}

# Ensure config directory exists
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

# Start daemon in background using Start-Process
Write-Host "[daemon] Starting daemon in background..." -ForegroundColor Cyan

# Find clawbuds-daemon executable
$daemonCmd = $null
try {
    # Try global installation
    $daemonCmd = (Get-Command clawbuds-daemon -ErrorAction SilentlyContinue).Source
} catch {}

if (-not $daemonCmd) {
    # Try npm prefix
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
    Write-Error "clawbuds-daemon not found. Please install globally first:`n  npm install -g clawbuds"
    exit 1
}

Write-Host "[daemon] Using daemon at: $daemonCmd" -ForegroundColor Gray

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "node"
$startInfo.Arguments = "`"$daemonCmd`""
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true
$startInfo.WorkingDirectory = $configDir

# Set environment variables
if ($env:OPENCLAW_HOOKS_TOKEN) { $startInfo.EnvironmentVariables["OPENCLAW_HOOKS_TOKEN"] = $env:OPENCLAW_HOOKS_TOKEN }
if ($env:OPENCLAW_HOOKS_URL) { $startInfo.EnvironmentVariables["OPENCLAW_HOOKS_URL"] = $env:OPENCLAW_HOOKS_URL }
if ($env:OPENCLAW_HOOKS_CHANNEL) { $startInfo.EnvironmentVariables["OPENCLAW_HOOKS_CHANNEL"] = $env:OPENCLAW_HOOKS_CHANNEL }
if ($env:CLAWBUDS_POLL_DIGEST_MS) { $startInfo.EnvironmentVariables["CLAWBUDS_POLL_DIGEST_MS"] = $env:CLAWBUDS_POLL_DIGEST_MS }
if ($env:CLAWBUDS_SERVER) { $startInfo.EnvironmentVariables["CLAWBUDS_SERVER"] = $env:CLAWBUDS_SERVER }
if ($env:CLAWBUDS_CONFIG_DIR) { $startInfo.EnvironmentVariables["CLAWBUDS_CONFIG_DIR"] = $env:CLAWBUDS_CONFIG_DIR }

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

# Start the process
try {
    $process.Start() | Out-Null
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    # Save PID
    $daemonPid = $process.Id
    Set-Content -Path $pidFile -Value $daemonPid

    Write-Host "[daemon] Started (PID: $daemonPid)" -ForegroundColor Green
    Write-Host "[daemon] Log file: $logFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To view logs in real-time:" -ForegroundColor White
    Write-Host "  Get-Content $logFile -Tail 20 -Wait" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop daemon:" -ForegroundColor White
    Write-Host "  Stop-Process -Id $daemonPid" -ForegroundColor Gray
} catch {
    Write-Error "Failed to start daemon: $_"
    exit 1
}
