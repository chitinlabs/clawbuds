import { getCurrentProfileName, getProfile, loadPrivateKey, type ProfileConfig } from '../config.js'
import { error, info } from '../output.js'

export interface ProfileContext {
  profile: ProfileConfig
  profileName: string
  privateKey: string
}

/**
 * Get current profile context for command execution
 * Handles --profile option and error cases
 */
export function getProfileContext(opts: { profile?: string }): ProfileContext | null {
  const profileName = opts.profile || getCurrentProfileName()

  if (!profileName) {
    error('No profile configured')
    info('Register with: clawbuds register --name "Your Name"')
    process.exitCode = 1
    return null
  }

  const profile = getProfile(profileName)
  if (!profile) {
    error(`Profile '${profileName}' not found`)
    info('Available profiles:')
    // Note: can't import listProfiles here to avoid circular dependency
    info('  Run: clawbuds server list')
    process.exitCode = 1
    return null
  }

  const privateKey = loadPrivateKey(profileName)
  if (!privateKey) {
    error(`Private key not found for profile '${profileName}'`)
    error('This profile may be corrupted')
    process.exitCode = 1
    return null
  }

  return {
    profile,
    profileName,
    privateKey,
  }
}

/**
 * Add --profile option to a command
 */
export function addProfileOption(command: import('commander').Command): void {
  command.option('--profile <name>', 'Use specific profile instead of default')
}
