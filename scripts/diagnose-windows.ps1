# ClawBuds Windows Diagnostic Script
# Run this to check for common issues and get troubleshooting guidance

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "🔍 ClawBuds Windows Diagnostic" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

$issues = @()
$warnings = @()

# 1. Check Node.js
Write-Host "[1/7] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = (node --version 2>$null)
    if ($nodeVersion) {
        Write-Host "  ✓ Node.js: $nodeVersion" -ForegroundColor Green
        if ($nodeVersion -match 'v(\d+)\.') {
            $majorVersion = [int]$matches[1]
            if ($majorVersion -lt 22) {
                $warnings += "Node.js version is $nodeVersion but 22+ is recommended"
            }
        }
    } else {
        $issues += "Node.js not found"
    }
} catch {
    $issues += "Node.js not found or not in PATH"
}

# 2. Check npm
Write-Host "[2/7] Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = (npm --version 2>$null)
    if ($npmVersion) {
        Write-Host "  ✓ npm: v$npmVersion" -ForegroundColor Green
    } else {
        $issues += "npm not found"
    }
} catch {
    $issues += "npm not found or not in PATH"
}

# 3. Check clawbuds CLI
Write-Host "[3/7] Checking clawbuds CLI..." -ForegroundColor Yellow
try {
    # Use cmd.exe to properly execute the clawbuds command
    $clawbudsVersion = cmd /c "clawbuds --version 2>nul"
    if ($LASTEXITCODE -eq 0 -and $clawbudsVersion) {
        Write-Host "  ✓ clawbuds CLI: $clawbudsVersion" -ForegroundColor Green
    } else {
        $issues += "clawbuds CLI not installed or not in PATH"
        Write-Host "  ✗ clawbuds CLI not found" -ForegroundColor Red
    }
} catch {
    $issues += "clawbuds CLI not installed or not in PATH"
    Write-Host "  ✗ clawbuds CLI not found" -ForegroundColor Red
}

# 4. Check clawbuds-daemon
Write-Host "[4/7] Checking clawbuds-daemon..." -ForegroundColor Yellow
$daemonFound = $false
try {
    $daemonCmd = (Get-Command clawbuds-daemon -ErrorAction SilentlyContinue)
    if ($daemonCmd) {
        Write-Host "  ✓ clawbuds-daemon: $($daemonCmd.Source)" -ForegroundColor Green
        $daemonFound = $true
    }
} catch {}

if (-not $daemonFound) {
    try {
        $npmPrefix = (npm prefix -g 2>$null).Trim()
        $daemonPath = Join-Path $npmPrefix "node_modules\.bin\clawbuds-daemon.cmd"
        if (Test-Path $daemonPath) {
            Write-Host "  ✓ clawbuds-daemon: $daemonPath" -ForegroundColor Green
            $daemonFound = $true
        }
    } catch {}
}

if (-not $daemonFound) {
    $warnings += "clawbuds-daemon not found (will be available after global install)"
    Write-Host "  ⚠️  clawbuds-daemon not found" -ForegroundColor Yellow
}

# 5. Check OpenClaw installation
Write-Host "[5/7] Checking OpenClaw..." -ForegroundColor Yellow
$openclawDir = "$env:USERPROFILE\.openclaw"
if (Test-Path $openclawDir) {
    Write-Host "  ✓ OpenClaw directory: $openclawDir" -ForegroundColor Green

    # Check OpenClaw config
    $openclawConfig = "$openclawDir\openclaw.json"
    if (Test-Path $openclawConfig) {
        Write-Host "  ✓ OpenClaw config found" -ForegroundColor Green
    } else {
        $warnings += "OpenClaw config not found at $openclawConfig"
    }

    # Check skill installation
    $skillDir = "$openclawDir\skills\clawbuds"
    if (Test-Path $skillDir) {
        Write-Host "  ✓ ClawBuds skill installed" -ForegroundColor Green
    } else {
        $warnings += "ClawBuds skill not installed at $skillDir"
        Write-Host "  ⚠️  ClawBuds skill not found" -ForegroundColor Yellow
    }
} else {
    $warnings += "OpenClaw not installed (optional)"
    Write-Host "  ℹ️  OpenClaw not found (optional)" -ForegroundColor Gray
}

# 6. Check configuration
Write-Host "[6/7] Checking configuration..." -ForegroundColor Yellow
$configDir = if ($env:CLAWBUDS_CONFIG_DIR) { $env:CLAWBUDS_CONFIG_DIR } else { "$env:USERPROFILE\.clawbuds" }
if (Test-Path $configDir) {
    Write-Host "  ✓ Config directory: $configDir" -ForegroundColor Green

    $identityFile = "$configDir\identity.json"
    if (Test-Path $identityFile) {
        Write-Host "  ✓ Identity file exists" -ForegroundColor Green
    } else {
        $warnings += "Not registered yet (run 'clawbuds register' first)"
        Write-Host "  ⚠️  Not registered yet" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ℹ️  Config directory not created yet" -ForegroundColor Gray
}

# 7. Check daemon status
Write-Host "[7/7] Checking daemon status..." -ForegroundColor Yellow
$pidFile = "$configDir\daemon.pid"
if (Test-Path $pidFile) {
    $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($pid) {
        try {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "  ✓ Daemon running (PID: $pid)" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️  Stale PID file (daemon not running)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  ⚠️  Daemon not running" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ℹ️  Daemon not started yet" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "📊 Summary" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan
Write-Host ""

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ All checks passed!" -ForegroundColor Green
} else {
    if ($issues.Count -gt 0) {
        Write-Host "❌ Issues found:" -ForegroundColor Red
        foreach ($issue in $issues) {
            Write-Host "   - $issue" -ForegroundColor Red
        }
        Write-Host ""
    }

    if ($warnings.Count -gt 0) {
        Write-Host "⚠️  Warnings:" -ForegroundColor Yellow
        foreach ($warning in $warnings) {
            Write-Host "   - $warning" -ForegroundColor Yellow
        }
        Write-Host ""
    }
}

# Recommendations
Write-Host "💡 Recommendations" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""

if ($issues -contains "clawbuds CLI not installed or not in PATH") {
    Write-Host "1. Install ClawBuds globally:" -ForegroundColor White
    Write-Host "   npm install -g clawbuds" -ForegroundColor Gray
    Write-Host ""
}

if ($warnings -match "Not registered") {
    Write-Host "2. Register your identity:" -ForegroundColor White
    Write-Host "   clawbuds register --server <server-url> --name `"Your Name`"" -ForegroundColor Gray
    Write-Host "   Example: clawbuds register --server http://localhost:3000 --name `"Alice`"" -ForegroundColor Gray
    Write-Host ""
}

if ($warnings -match "skill not installed") {
    Write-Host "3. Install OpenClaw skill:" -ForegroundColor White
    Write-Host "   Copy openclaw-skill\clawbuds to $env:USERPROFILE\.openclaw\skills\" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "📚 Documentation" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Quick Start: .\docs\QUICKSTART.md" -ForegroundColor Gray
Write-Host "  OpenClaw Guide: .\docs\OPENCLAW_QUICKSTART.md" -ForegroundColor Gray
Write-Host "  Troubleshooting: .\docs\TROUBLESHOOTING.md" -ForegroundColor Gray
Write-Host ""
Write-Host "💬 Get help: clawbuds --help" -ForegroundColor Cyan
Write-Host ""
