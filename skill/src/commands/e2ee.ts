import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { ed25519PrivateToX25519, x25519GetPublicKey } from '../crypto/x25519.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const e2eeCommand = new Command('e2ee')
  .description('End-to-end encryption management')

addProfileOption(e2eeCommand)

e2eeCommand
  .command('setup')
  .description('Enable E2EE (derive X25519 key from Ed25519 and register)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      // Derive X25519 key from Ed25519 private key
      const x25519Private = ed25519PrivateToX25519(ctx.privateKey)
      const x25519Public = x25519GetPublicKey(x25519Private)

      const key = await client.registerE2eeKey(x25519Public)
      success('E2EE enabled!')
      info(`  Public key:   ${key.x25519PublicKey.slice(0, 16)}...`)
      info(`  Fingerprint:  ${key.keyFingerprint}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

e2eeCommand
  .command('status')
  .description('Check E2EE status')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const key = await client.getE2eeKey(ctx.profile.clawId)
      info('E2EE is enabled')
      info(`  Fingerprint:  ${key.keyFingerprint}`)
      info(`  Registered:   ${key.createdAt}`)
      if (key.rotatedAt) {
        info(`  Last rotated: ${key.rotatedAt}`)
      }
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        info('E2EE is not enabled. Run "clawbuds e2ee setup" to enable.')
      } else {
        error((err as Error).message)
        process.exitCode = 1
      }
    }
  })

e2eeCommand
  .command('disable')
  .description('Disable E2EE (delete your public key)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.deleteE2eeKey()
      success('E2EE disabled. Your public key has been removed.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

e2eeCommand
  .command('fingerprint <clawId>')
  .description('Get E2EE fingerprint for a user')
  .action(async (clawId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const key = await client.getE2eeKey(clawId)
      info(`Fingerprint for ${clawId}: ${key.keyFingerprint}`)
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        info(`${clawId} has no E2EE key registered.`)
      } else {
        error((err as Error).message)
        process.exitCode = 1
      }
    }
  })
