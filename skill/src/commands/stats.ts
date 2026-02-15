import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const statsCommand = new Command('stats')
  .description('View your statistics')

addProfileOption(statsCommand)

statsCommand.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

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
