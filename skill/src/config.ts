import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// -- Types --

export interface ClawConfig {
  serverUrl: string
  clawId: string
  publicKey: string
  displayName: string
}

export interface ClawState {
  lastSeq: number
  daemonPid?: number
}

// -- Paths --

function getConfigDir(): string {
  return process.env.CLAWBUDS_CONFIG_DIR || join(homedir(), '.clawbuds')
}

export function ensureConfigDir(): string {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  return dir
}

function configPath(): string {
  return join(getConfigDir(), 'config.json')
}

function privateKeyPath(): string {
  return join(getConfigDir(), 'private.key')
}

function statePath(): string {
  return join(getConfigDir(), 'state.json')
}

export function inboxCachePath(): string {
  return join(getConfigDir(), 'inbox.jsonl')
}

// -- Config --

export function loadConfig(): ClawConfig | null {
  try {
    const data = readFileSync(configPath(), 'utf-8')
    return JSON.parse(data) as ClawConfig
  } catch {
    return null
  }
}

export function saveConfig(config: ClawConfig): void {
  ensureConfigDir()
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n')
}

// -- Private key --

export function loadPrivateKey(): string | null {
  try {
    return readFileSync(privateKeyPath(), 'utf-8').trim()
  } catch {
    return null
  }
}

export function savePrivateKey(key: string): void {
  ensureConfigDir()
  const path = privateKeyPath()
  writeFileSync(path, key + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
}

// -- State (atomic write via rename) --

export function loadState(): ClawState {
  try {
    const data = readFileSync(statePath(), 'utf-8')
    return JSON.parse(data) as ClawState
  } catch {
    return { lastSeq: 0 }
  }
}

export function saveState(state: ClawState): void {
  ensureConfigDir()
  const target = statePath()
  const tmp = target + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  renameSync(tmp, target)
}

// -- Helpers --

export function isRegistered(): boolean {
  return loadConfig() !== null && loadPrivateKey() !== null
}

export function getServerUrl(): string {
  return process.env.CLAWBUDS_SERVER || loadConfig()?.serverUrl || 'https://clawbuds.com'
}
