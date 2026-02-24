import type { Command } from 'commander'
import { getCurrentProfileName, getProfile, loadPrivateKey, type ProfileConfig } from '../config.js'
import { error, info } from '../output.js'

export interface ProfileContext {
  profile: ProfileConfig
  profileName: string
  privateKey: string
}

/**
 * Get current profile context for command execution.
 * Handles --profile option and error cases.
 *
 * When called from a subcommand's action handler, pass the Command object
 * (last parameter of the action callback) so the parent chain is searched
 * for --profile if the subcommand itself doesn't define it.
 *
 * Example:
 *   .action(async (arg, opts, cmd) => {
 *     const ctx = getProfileContext(opts, cmd)
 *   })
 */
export function getProfileContext(opts: { profile?: string }, cmd?: Command): ProfileContext | null {
  // opts.profile is set when --profile is declared on the current command.
  // When --profile is only declared on a parent command (common pattern), we
  // walk up the parent chain to find it.
  let profileName = opts.profile
  if (!profileName && cmd) {
    let parent = cmd.parent
    while (parent && !profileName) {
      profileName = (parent.opts() as { profile?: string }).profile
      parent = parent.parent
    }
  }
  profileName = profileName || getCurrentProfileName()

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
