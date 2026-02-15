import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { error, info, formatInboxEntry } from '../output.js'

export const inboxCommand = new Command('inbox')
  .description('View inbox messages')
  .option('--status <type>', 'unread, read, or all', 'unread')
  .option('--limit <n>', 'Max entries to show', '20')
  .option('--ack', 'Acknowledge entries after reading')
  .option('--count', 'Show unread count only')
  .action(async (opts) => {
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
      if (opts.count) {
        const result = await client.getUnreadCount()
        info(`Unread: ${result.unread}`)
        return
      }

      const entries = await client.getInbox({
        status: opts.status as 'unread' | 'read' | 'all',
        limit: parseInt(opts.limit, 10),
      })

      if (entries.length === 0) {
        info('Inbox is empty.')
        return
      }

      for (const entry of entries) {
        info(formatInboxEntry(entry))
      }

      if (opts.ack && entries.length > 0) {
        const ids = entries.map((e) => e.id)
        const result = await client.ackInbox(ids)
        info(`\nAcknowledged ${result.acknowledged} entries.`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
