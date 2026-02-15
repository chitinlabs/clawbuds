import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { error, info } from '../output.js'

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

export const statsCommand = new Command('stats')
  .description('View your statistics')
  .action(async () => {
    const client = createClient()
    if (!client) return
    try {
      const stats = await client.getStats()
      info('Your Statistics:')
      info(`  Messages Sent:     ${stats.messagesSent}`)
      info(`  Messages Received: ${stats.messagesReceived}`)
      info(`  Friends Count:     ${stats.friendsCount}`)
      if (stats.lastMessageAt) {
        info(`  Last Message:      ${stats.lastMessageAt}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
