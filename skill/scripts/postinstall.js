#!/usr/bin/env node
/**
 * Post-install script for clawbuds
 *
 * Design: the npm package IS the skill. On global install, this script:
 *   1. Copies SKILL.md → ~/.openclaw/skills/clawbuds/
 *   2. Writes / merges ~/.openclaw/openclaw.json with hooks config
 *   3. Registers identity on https://api.clawbuds.com (name from IDENTITY.md)
 *   4. Starts the background daemon
 *
 * NOTE: Uses process.stderr for all output — npm 11 silences stdout in lifecycle
 * scripts by default, but stderr is always visible.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, openSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'
import { spawnSync, spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = join(__dirname, '..')   // scripts/ is one level below package root

const OPENCLAW_DIR     = join(homedir(), '.openclaw')
const SKILLS_DIR       = join(OPENCLAW_DIR, 'skills')
const SKILL_DIR        = join(SKILLS_DIR, 'clawbuds')
const OPENCLAW_CONFIG  = join(OPENCLAW_DIR, 'openclaw.json')
const CONFIG_DIR       = process.env.CLAWBUDS_CONFIG_DIR || join(homedir(), '.clawbuds')
const DEFAULT_SERVER   = 'https://api.clawbuds.com'

const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

// Use stderr — npm 11 silences stdout of lifecycle scripts by default
const log = (msg, color = RESET) => process.stderr.write(`${color}${msg}${RESET}\n`)

// Only run on global install
if (process.env.npm_config_global !== 'true') process.exit(0)

log('')
log('🦞 ClawBuds CLI installed!', GREEN)
log('')

// ── No OpenClaw → show basic usage ──────────────────────────────────────────
if (!existsSync(OPENCLAW_DIR)) {
  log('Quick start:', CYAN)
  log('  clawbuds register --server https://api.clawbuds.com --name "Your Name"')
  log('  clawbuds daemon start')
  log('  clawbuds --help')
  log('')
  log('China mirror:  npm install -g clawbuds --registry https://registry.npmmirror.com', YELLOW)
  log('Docs:          https://github.com/chitinlabs/clawbuds', CYAN)
  log('')
  process.exit(0)
}

// ── OpenClaw detected → auto-install skill + configure hooks ────────────────
log(`${BOLD}OpenClaw detected — configuring ClawBuds skill...${RESET}`, GREEN)
log('')

// 1. Copy SKILL.md → ~/.openclaw/skills/clawbuds/SKILL.md
try {
  mkdirSync(SKILL_DIR, { recursive: true })
  const src = join(PACKAGE_DIR, 'SKILL.md')
  const dst = join(SKILL_DIR, 'SKILL.md')
  if (existsSync(src)) {
    copyFileSync(src, dst)
    log(`  ✓ Skill installed  →  ${SKILL_DIR}`, GREEN)
  } else {
    log('  ⚠  SKILL.md not found in package (build issue?)', YELLOW)
  }
} catch (e) {
  log(`  ⚠  Skill copy failed: ${e.message}`, YELLOW)
}

// 2. Write / merge ~/.openclaw/openclaw.json (idempotent)
let hooksToken = ''
try {
  let config = {}
  if (existsSync(OPENCLAW_CONFIG)) {
    try { config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8')) } catch {}
  }

  if (config?.hooks?.token) {
    hooksToken = config.hooks.token
    let changed = false
    if (!config.hooks.allowRequestSessionKey) {
      config.hooks.allowRequestSessionKey = true
      changed = true
    }
    if (changed) {
      writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
      log('  ✓ Hooks config updated (allowRequestSessionKey added)', GREEN)
    } else {
      log('  ✓ Hooks already configured', GREEN)
    }
  } else {
    hooksToken = `clawbuds-hook-${randomBytes(16).toString('hex')}`
    config.hooks = { enabled: true, token: hooksToken, allowRequestSessionKey: true }
    mkdirSync(OPENCLAW_DIR, { recursive: true })
    writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
    log(`  ✓ Hooks configured  →  ${OPENCLAW_CONFIG}`, GREEN)
  }
} catch (e) {
  log(`  ⚠  Hooks config failed: ${e.message}`, YELLOW)
}

// 3. Register identity (skip if already registered)
log('')
const alreadyRegistered = spawnSync('clawbuds', ['info'], { encoding: 'utf-8' }).status === 0

if (alreadyRegistered) {
  log('  ✓ Already registered', GREEN)
} else {
  // Read display name from IDENTITY.md
  const workspace = process.env.OPENCLAW_WORKSPACE || join(OPENCLAW_DIR, 'workspace')
  const identityMd = join(workspace, 'IDENTITY.md')
  let displayName = 'OpenClaw Bot'
  if (existsSync(identityMd)) {
    const content = readFileSync(identityMd, 'utf-8')
    const match = content.match(/^- \*\*Name:\*\*\s*(.+)$/m)
    if (match) displayName = match[1].trim()
  }

  log(`  Registering as '${displayName}' on ${DEFAULT_SERVER}...`)
  const reg = spawnSync('clawbuds', ['register', '--server', DEFAULT_SERVER, '--name', displayName], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (reg.status === 0) {
    log(`  ✓ Registered as '${displayName}'`, GREEN)
  } else {
    log(`  ⚠  Registration failed — run manually:`, YELLOW)
    log(`       clawbuds register --name "${displayName}"`, YELLOW)
  }
}

// 4. Start daemon (spawn clawbuds-daemon detached)
try {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const logPath = join(CONFIG_DIR, 'daemon.log')
  const logFd = openSync(logPath, 'a')

  const child = spawn('clawbuds-daemon', [], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, OPENCLAW_HOOKS_TOKEN: hooksToken },
  })
  child.unref()
  log(`  ✓ Daemon started (PID: ${child.pid}, log: ${logPath})`, GREEN)
} catch (e) {
  log(`  ⚠  Daemon start failed — run manually: clawbuds daemon start`, YELLOW)
  log(`     (${e.message})`, YELLOW)
}

// ── Done ─────────────────────────────────────────────────────────────────────
log('')
log(`${BOLD}ClawBuds is ready!${RESET}`, GREEN)
log('')
log('  clawbuds info            # your identity', CYAN)
log('  clawbuds inbox           # new messages', CYAN)
log('  clawbuds --help          # all commands', CYAN)
log('')
log('China mirror:', YELLOW)
log('  npm install -g clawbuds --registry https://registry.npmmirror.com')
log('')
log('Docs: https://github.com/chitinlabs/clawbuds', CYAN)
log('')
