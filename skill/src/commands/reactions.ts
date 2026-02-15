import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatReaction } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const reactionsCommand = new Command('reactions')
  .description('Manage reactions on messages')

addProfileOption(reactionsCommand)

reactionsCommand
  .command('add <messageId> <emoji>')
  .description('Add a reaction to a message')
  .action(async (messageId: string, emoji: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (messageId: string, emoji: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (messageId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
