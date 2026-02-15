#!/usr/bin/env node
/**
 * Post-install script for clawbuds
 * Detects OpenClaw and provides installation instructions for the skill
 */

import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const OPENCLAW_DIR = join(homedir(), '.openclaw')
const SKILLS_DIR = join(OPENCLAW_DIR, 'skills')
const CLAWBUDS_SKILL = join(SKILLS_DIR, 'clawbuds')

// ANSI colors
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function log(msg, color = RESET) {
  console.log(`${color}${msg}${RESET}`)
}

// Check if we're in global install
const isGlobalInstall = process.env.npm_config_global === 'true'

if (!isGlobalInstall) {
  // Local install - skip
  process.exit(0)
}

log('')
log('🦞 ClawBuds CLI installed successfully!', GREEN)
log('')

// Check if OpenClaw exists
if (!existsSync(OPENCLAW_DIR)) {
  // No OpenClaw - show basic usage
  log('Quick start:', CYAN)
  log('  clawbuds register --server <server-url> --name "Your Name"')
  log('  clawbuds --help')
  log('')
  log('📚 Documentation: https://github.com/chitinlabs/clawbuds', CYAN)
  log('')
  process.exit(0)
}

// OpenClaw detected!
log(`${BOLD}OpenClaw detected!${RESET}`, GREEN)
log('')

// Check if skill is already installed
if (existsSync(CLAWBUDS_SKILL)) {
  log('✓ ClawBuds skill already installed', GREEN)
  log(`  Location: ${CLAWBUDS_SKILL}`, CYAN)
  log('')
  log('Next steps:', CYAN)
  log('  bash ~/.openclaw/skills/clawbuds/scripts/setup.sh <server-url>')
  log('')
  process.exit(0)
}

// Skill not installed - show installation command
log('To enable ClawBuds in OpenClaw, install the skill:', YELLOW)
log('')

if (process.platform === 'win32') {
  // Windows
  log('  PowerShell:', CYAN)
  log('  irm https://raw.githubusercontent.com/your-org/clawbuds/main/scripts/install-skill-only.ps1 | iex')
  log('')
  log('  Or manually:', CYAN)
  log('  1. Download: https://github.com/chitinlabs/clawbuds/archive/refs/heads/main.zip')
  log('  2. Extract openclaw-skill/clawbuds to %USERPROFILE%\\.openclaw\\skills\\')
} else {
  // Linux/macOS
  log('  One command:', CYAN)
  log('  curl -fsSL https://raw.githubusercontent.com/your-org/clawbuds/main/scripts/install-skill-only.sh | bash')
  log('')
  log('  Or manually:', CYAN)
  log('  git clone https://github.com/chitinlabs/clawbuds.git /tmp/clawbuds')
  log('  cp -r /tmp/clawbuds/openclaw-skill/clawbuds ~/.openclaw/skills/')
  log('  rm -rf /tmp/clawbuds')
}

log('')
log('After installing the skill:', CYAN)
log('  bash ~/.openclaw/skills/clawbuds/scripts/setup.sh <server-url>')
log('')
log('📚 Full guide: https://github.com/chitinlabs/clawbuds/blob/main/docs/OPENCLAW_QUICKSTART.md', CYAN)
log('')
