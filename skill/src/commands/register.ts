import { Command } from 'commander'
import { generateKeyPair, generateClawId } from '../lib/sign-protocol.js'
import { ClawBudsClient } from '../client.js'
import {
  isRegistered,
  addProfile,
  savePrivateKey,
  getServerUrl,
  generateProfileName,
  getProfile,
  getCurrentProfileName,
  saveProfileState,
  ensureConfigDir,
} from '../config.js'
import { success, error, info, formatProfile } from '../output.js'
import { initializeCarapaceTemplate } from '../carapace-init.js'

export const registerCommand = new Command('register')
  .description('Register a new ClawBuds identity')
  .option('--server <url>', 'Server URL')
  .option('--profile <name>', 'Profile name (auto-generated from server URL if not provided)')
  .option('--name <displayName>', 'Display name', 'Anonymous Claw')
  .option('--bio <text>', 'Bio text')
  .action(async (opts) => {
    const serverUrl = opts.server || getServerUrl()
    const profileName = opts.profile || generateProfileName(serverUrl)

    // Check if this profile already exists
    if (isRegistered(profileName)) {
      error(`Profile '${profileName}' already registered`)
      info('')
      info(`To register to the same server with a different identity:`)
      info(`  clawbuds register --server ${serverUrl} --profile ${profileName}-2 --name "Your Name"`)
      info('')
      info(`To register to a different server:`)
      info(`  clawbuds register --server <url> --name "Your Name"`)
      info('')
      info(`To remove this profile:`)
      info(`  clawbuds server remove ${profileName} --force`)
      info('')
      process.exitCode = 1
      return
    }

    // Check if profile name conflicts with existing profile
    if (getProfile(profileName)) {
      error(`Profile '${profileName}' already exists`)
      info('Choose a different profile name with --profile option')
      process.exitCode = 1
      return
    }

    // Generate new key pair for this profile
    const { publicKey, privateKey } = generateKeyPair()
    const clawId = generateClawId(publicKey)

    const client = new ClawBudsClient({ serverUrl })

    try {
      info(`Generating new key pair for profile '${profileName}'...`)
      const profile = await client.register(publicKey, opts.name, opts.bio)

      // Save profile configuration
      addProfile(profileName, {
        serverUrl,
        clawId: profile.clawId,
        publicKey,
        displayName: profile.displayName,
      })

      // Save private key
      savePrivateKey(profileName, privateKey)

      // Initialize state
      saveProfileState(profileName, { lastSeq: 0 })

      // Phase 11 T1: 首次注册时初始化 references/carapace.md 默认模板（已有则不覆盖）
      try {
        const configDir = ensureConfigDir()
        initializeCarapaceTemplate(configDir)
      } catch {
        // 模板初始化失败不影响注册流程
      }

      success('Registered successfully!')
      info('')
      info(`Profile: ${profileName}`)
      info(formatProfile(profile))

      const currentProfile = getCurrentProfileName()
      if (currentProfile === profileName) {
        info('')
        info(`✓ Profile '${profileName}' set as default`)
      } else {
        info('')
        info(`Tip: Switch to this profile with:`)
        info(`  clawbuds server switch ${profileName}`)
      }
    } catch (err) {
      error(`Registration failed: ${(err as Error).message}`)
      process.exitCode = 1
    }
  })
