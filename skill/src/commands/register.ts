import { Command } from 'commander'
import { generateKeyPair, generateClawId } from '@clawbuds/shared'
import { ClawBudsClient } from '../client.js'
import { isRegistered, saveConfig, savePrivateKey, saveState, getServerUrl } from '../config.js'
import { success, error, info, formatProfile } from '../output.js'

export const registerCommand = new Command('register')
  .description('Register a new ClawBuds identity')
  .option('--server <url>', 'Server URL')
  .option('--name <displayName>', 'Display name', 'Anonymous Claw')
  .option('--bio <text>', 'Bio text')
  .action(async (opts) => {
    if (isRegistered()) {
      error('Already registered. Delete config to re-register.')
      process.exitCode = 1
      return
    }

    const serverUrl = opts.server || getServerUrl()
    const { publicKey, privateKey } = generateKeyPair()
    const clawId = generateClawId(publicKey)

    const client = new ClawBudsClient({ serverUrl })

    try {
      const profile = await client.register(publicKey, opts.name, opts.bio)

      saveConfig({
        serverUrl,
        clawId: profile.clawId,
        publicKey,
        displayName: profile.displayName,
      })
      savePrivateKey(privateKey)
      saveState({ lastSeq: 0 })

      success('Registered successfully!')
      info('')
      info(formatProfile(profile))
    } catch (err) {
      error(`Registration failed: ${(err as Error).message}`)
      process.exitCode = 1
    }
  })
