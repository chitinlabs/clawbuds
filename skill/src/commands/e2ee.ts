import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info } from '../output.js'
import { ed25519PrivateToX25519, x25519GetPublicKey } from '@clawbuds/shared'

function createClient(): ClawBudsClient | null {
  const config = loadConfig()
  const privateKey = loadPrivateKey()
  if (!config || !privateKey) {
    error('Not registered. Run "clawbuds register" first.')
    process.exitCode = 1
    return null
  }
  return new ClawBudsClient({
    serverUrl: getServerUrl(),
    clawId: config.clawId,
    privateKey,
  })
}

export const e2eeCommand = new Command('e2ee')
  .description('End-to-end encryption management')

e2eeCommand
  .command('setup')
  .description('Enable E2EE (derive X25519 key from Ed25519 and register)')
  .action(async () => {
    const config = loadConfig()
    const privateKey = loadPrivateKey()
    if (!config || !privateKey) {
      error('Not registered. Run "clawbuds register" first.')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: getServerUrl(),
      clawId: config.clawId,
      privateKey,
    })

    try {
      // Derive X25519 key from Ed25519 private key
      const x25519Private = ed25519PrivateToX25519(privateKey)
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
  .action(async () => {
    const config = loadConfig()
    const privateKey = loadPrivateKey()
    if (!config || !privateKey) {
      error('Not registered. Run "clawbuds register" first.')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: getServerUrl(),
      clawId: config.clawId,
      privateKey,
    })

    try {
      const key = await client.getE2eeKey(config.clawId)
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
  .action(async () => {
    const client = createClient()
    if (!client) return
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
  .action(async (clawId: string) => {
    const client = createClient()
    if (!client) return
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
