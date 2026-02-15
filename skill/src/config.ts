import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// -- Types --

export interface ProfileConfig {
  serverUrl: string
  clawId: string
  publicKey: string
  displayName: string
}

export interface MultiProfileConfig {
  version: string
  defaultProfile?: string
  profiles: Record<string, ProfileConfig>
}

export interface ProfileState {
  lastSeq: number
  daemonPid?: number
}

export interface StateStore {
  [profile: string]: ProfileState
}

// Legacy config format (for migration)
interface LegacyClawConfig {
  serverUrl: string
  clawId: string
  publicKey: string
  displayName: string
}

// -- Paths --

function getConfigDir(): string {
  return process.env.CLAWBUDS_CONFIG_DIR || join(homedir(), '.clawbuds')
}

export function ensureConfigDir(): string {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })

  // Ensure keys directory exists
  const keysDir = join(dir, 'keys')
  mkdirSync(keysDir, { recursive: true })

  return dir
}

function configPath(): string {
  return join(getConfigDir(), 'config.json')
}

function privateKeyPath(profile: string): string {
  return join(getConfigDir(), 'keys', `${profile}.key`)
}

// Legacy private key path (for migration)
function legacyPrivateKeyPath(): string {
  return join(getConfigDir(), 'private.key')
}

function statePath(): string {
  return join(getConfigDir(), 'state.json')
}

export function inboxCachePath(): string {
  return join(getConfigDir(), 'inbox.jsonl')
}

// -- Profile name generation --

export function generateProfileName(serverUrl: string): string {
  try {
    const url = new URL(serverUrl)
    // https://clawbuds.com → clawbuds-com
    // https://my-server.com:8080 → my-server-com-8080
    return url.host.replace(/[.:]/g, '-')
  } catch {
    // Fallback for invalid URLs
    return serverUrl.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  }
}

// -- Config migration --

function isLegacyConfig(data: unknown): data is LegacyClawConfig {
  const obj = data as Record<string, unknown>
  return (
    typeof obj.serverUrl === 'string' &&
    typeof obj.clawId === 'string' &&
    typeof obj.publicKey === 'string' &&
    typeof obj.displayName === 'string' &&
    !('profiles' in obj)
  )
}

function migrateLegacyConfig(legacy: LegacyClawConfig): MultiProfileConfig {
  const profileName = generateProfileName(legacy.serverUrl)

  return {
    version: '2.0',
    defaultProfile: profileName,
    profiles: {
      [profileName]: {
        serverUrl: legacy.serverUrl,
        clawId: legacy.clawId,
        publicKey: legacy.publicKey,
        displayName: legacy.displayName,
      },
    },
  }
}

function migrateLegacyPrivateKey(profileName: string): void {
  const legacyPath = legacyPrivateKeyPath()
  const newPath = privateKeyPath(profileName)

  if (existsSync(legacyPath) && !existsSync(newPath)) {
    // Move legacy private key to new location
    const key = readFileSync(legacyPath, 'utf-8')
    savePrivateKey(profileName, key.trim())
    // Keep legacy file for safety (can be manually deleted later)
  }
}

// -- Config --

export function loadConfig(): MultiProfileConfig | null {
  try {
    const data = readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(data)

    // Handle legacy config
    if (isLegacyConfig(parsed)) {
      const migrated = migrateLegacyConfig(parsed)
      saveConfig(migrated)

      // Migrate private key
      if (migrated.defaultProfile) {
        migrateLegacyPrivateKey(migrated.defaultProfile)
      }

      return migrated
    }

    return parsed as MultiProfileConfig
  } catch {
    return null
  }
}

export function saveConfig(config: MultiProfileConfig): void {
  ensureConfigDir()
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n')
}

// -- Profile management --

export function getProfile(profileName: string): ProfileConfig | null {
  const config = loadConfig()
  if (!config) return null
  return config.profiles[profileName] || null
}

export function getCurrentProfileName(): string | null {
  // Priority:
  // 1. CLAWBUDS_PROFILE environment variable
  // 2. config.defaultProfile
  // 3. If only one profile exists, use it
  // 4. Return null

  const envProfile = process.env.CLAWBUDS_PROFILE
  if (envProfile) return envProfile

  const config = loadConfig()
  if (!config) return null

  if (config.defaultProfile) {
    return config.defaultProfile
  }

  const profileNames = Object.keys(config.profiles)
  if (profileNames.length === 1) {
    return profileNames[0]
  }

  return null
}

export function getCurrentProfile(): ProfileConfig | null {
  const profileName = getCurrentProfileName()
  if (!profileName) return null
  return getProfile(profileName)
}

export function setDefaultProfile(profileName: string): boolean {
  const config = loadConfig()
  if (!config) return false

  if (!(profileName in config.profiles)) {
    return false
  }

  config.defaultProfile = profileName
  saveConfig(config)
  return true
}

export function addProfile(profileName: string, profile: ProfileConfig): void {
  ensureConfigDir()
  const config = loadConfig() || {
    version: '2.0',
    profiles: {},
  }

  config.profiles[profileName] = profile

  // If this is the first profile, set it as default
  if (!config.defaultProfile || Object.keys(config.profiles).length === 1) {
    config.defaultProfile = profileName
  }

  saveConfig(config)
}

export function removeProfile(profileName: string): boolean {
  const config = loadConfig()
  if (!config || !(profileName in config.profiles)) {
    return false
  }

  // Remove profile from config
  delete config.profiles[profileName]

  // If this was the default profile, set a new default
  if (config.defaultProfile === profileName) {
    const remainingProfiles = Object.keys(config.profiles)
    config.defaultProfile = remainingProfiles.length > 0 ? remainingProfiles[0] : undefined
  }

  saveConfig(config)

  // Remove private key
  const keyPath = privateKeyPath(profileName)
  if (existsSync(keyPath)) {
    unlinkSync(keyPath)
  }

  return true
}

export function renameProfile(oldName: string, newName: string): boolean {
  const config = loadConfig()
  if (!config || !(oldName in config.profiles)) {
    return false
  }

  if (newName in config.profiles) {
    return false // New name already exists
  }

  // Copy profile to new name
  config.profiles[newName] = config.profiles[oldName]
  delete config.profiles[oldName]

  // Update default profile if needed
  if (config.defaultProfile === oldName) {
    config.defaultProfile = newName
  }

  saveConfig(config)

  // Rename private key
  const oldKeyPath = privateKeyPath(oldName)
  const newKeyPath = privateKeyPath(newName)
  if (existsSync(oldKeyPath)) {
    const key = readFileSync(oldKeyPath, 'utf-8')
    savePrivateKey(newName, key.trim())
    unlinkSync(oldKeyPath)
  }

  // Update state
  const state = loadState()
  if (oldName in state) {
    state[newName] = state[oldName]
    delete state[oldName]
    saveState(state)
  }

  return true
}

export function listProfiles(): Array<{ name: string; profile: ProfileConfig; isDefault: boolean }> {
  const config = loadConfig()
  if (!config) return []

  return Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    profile,
    isDefault: name === config.defaultProfile,
  }))
}

// -- Private key --

export function loadPrivateKey(profileName: string): string | null {
  try {
    return readFileSync(privateKeyPath(profileName), 'utf-8').trim()
  } catch {
    return null
  }
}

export function savePrivateKey(profileName: string, key: string): void {
  ensureConfigDir()
  const path = privateKeyPath(profileName)
  writeFileSync(path, key + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
}

// -- State (atomic write via rename) --

export function loadState(): StateStore {
  try {
    const data = readFileSync(statePath(), 'utf-8')
    return JSON.parse(data) as StateStore
  } catch {
    return {}
  }
}

export function saveState(state: StateStore): void {
  ensureConfigDir()
  const target = statePath()
  const tmp = target + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  renameSync(tmp, target)
}

export function getProfileState(profileName: string): ProfileState {
  const state = loadState()
  return state[profileName] || { lastSeq: 0 }
}

export function saveProfileState(profileName: string, profileState: ProfileState): void {
  const state = loadState()
  state[profileName] = profileState
  saveState(state)
}

// -- Helpers --

export function isRegistered(profileName?: string): boolean {
  if (profileName) {
    return getProfile(profileName) !== null && loadPrivateKey(profileName) !== null
  }

  // Check if any profile is registered
  const config = loadConfig()
  if (!config) return false

  const profiles = Object.keys(config.profiles)
  return profiles.length > 0 && profiles.some((p) => loadPrivateKey(p) !== null)
}

export function getServerUrl(profileName?: string): string {
  const defaultServer = 'https://clawbuds.com'

  if (process.env.CLAWBUDS_SERVER) {
    return process.env.CLAWBUDS_SERVER
  }

  if (profileName) {
    const profile = getProfile(profileName)
    return profile?.serverUrl || defaultServer
  }

  const currentProfile = getCurrentProfile()
  return currentProfile?.serverUrl || defaultServer
}
