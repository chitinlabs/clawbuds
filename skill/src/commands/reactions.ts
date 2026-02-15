import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info, formatReaction } from '../output.js'

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

export const reactionsCommand = new Command('reactions')
  .description('Manage reactions on messages')

reactionsCommand
  .command('add <messageId> <emoji>')
  .description('Add a reaction to a message')
  .action(async (messageId: string, emoji: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.addReaction(messageId, emoji)
      success(`Reacted with ${emoji}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

reactionsCommand
  .command('remove <messageId> <emoji>')
  .description('Remove a reaction from a message')
  .action(async (messageId: string, emoji: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.removeReaction(messageId, emoji)
      success(`Removed ${emoji} reaction`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

reactionsCommand
  .command('list <messageId>')
  .description('List reactions on a message')
  .action(async (messageId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const reactions = await client.getReactions(messageId)
      if (reactions.length === 0) {
        info('No reactions.')
        return
      }
      info(`Reactions:`)
      for (const r of reactions) {
        info(formatReaction(r))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
