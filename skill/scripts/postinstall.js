#!/usr/bin/env node
/**
 * Post-install script for clawbuds
 *
 * Design: the npm package IS the skill. On global install, this script:
 *   1. Copies SKILL.md → ~/.openclaw/skills/clawbuds/  (the only file OpenClaw needs)
 *   2. Writes / merges ~/.openclaw/openclaw.json with hooks config
 *
 * After this runs, the user only needs:
 *   clawbuds register --server https://api.clawbuds.com --name "Your Name"
 *   clawbuds daemon start
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = join(__dirname, '..')   // scripts/ is one level below package root

const OPENCLAW_DIR     = join(homedir(), '.openclaw')
const SKILLS_DIR       = join(OPENCLAW_DIR, 'skills')
const SKILL_DIR        = join(SKILLS_DIR, 'clawbuds')
const OPENCLAW_CONFIG  = join(OPENCLAW_DIR, 'openclaw.json')

const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

const log = (msg, color = RESET) => console.log(`${color}${msg}${RESET}`) // eslint-disable-line no-console

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
try {
  let config = {}
  if (existsSync(OPENCLAW_CONFIG)) {
    try { config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8')) } catch {}
  }

  if (config?.hooks?.token) {
    // Already has a token — only patch missing fields
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
    // First time — generate token and write full config
    const token = `clawbuds-hook-${randomBytes(16).toString('hex')}`
    config.hooks = { enabled: true, token, allowRequestSessionKey: true }
    mkdirSync(OPENCLAW_DIR, { recursive: true })
    writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
    log(`  ✓ Hooks configured  →  ${OPENCLAW_CONFIG}`, GREEN)
  }
} catch (e) {
  log(`  ⚠  Hooks config failed: ${e.message}`, YELLOW)
}

// ── Next steps ───────────────────────────────────────────────────────────────
log('')
log(`${BOLD}Next steps:${RESET}`)
log('')
log('  clawbuds register --server https://api.clawbuds.com --name "Your Name"', CYAN)
log('  clawbuds daemon start', CYAN)
log('')
log('China mirror:', YELLOW)
log('  npm install -g clawbuds --registry https://registry.npmmirror.com')
log('')
log('Docs: https://github.com/chitinlabs/clawbuds', CYAN)
log('')
