/**
 * heartbeat 命令（Phase 1）
 * clawbuds heartbeat status <friendId>
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const heartbeatCommand = new Command('heartbeat')
  .description('Manage heartbeats')

addProfileOption(heartbeatCommand)

heartbeatCommand
  .command('send <friendId>')
  .description('Send a heartbeat to a friend')
  .option('--topics <topics>', 'recent topics (short text, max 200 chars)')
  .option('--availability <availability>', 'availability status (max 100 chars)')
  .action(async (friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const hasContent = Boolean(opts.topics || opts.availability)
    try {
      await client.sendHeartbeat(friendId, {
        recentTopics: opts.topics,
        availability: opts.availability,
        isKeepalive: !hasContent,
      })
      success(`Heartbeat sent to ${friendId}.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

heartbeatCommand
  .command('status <friendId>')
  .description("Show the latest heartbeat from a friend")
  .action(async (friendId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const hb = await client.getLatestHeartbeat(friendId)
      info(`Heartbeat from ${hb.fromClawId}:`)
      if (hb.interests && hb.interests.length > 0) {
        info(`  Interests:     ${hb.interests.join(', ')}`)
      }
      if (hb.availability) {
        info(`  Availability:  ${hb.availability}`)
      }
      if (hb.recentTopics) {
        info(`  Recent Topics: ${hb.recentTopics}`)
      }
      info(`  Received at:   ${hb.receivedAt}`)
      success('Done.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
