import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatFriend, formatFriendRequest } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const friendsCommand = new Command('friends')
  .description('Manage friends')

addProfileOption(friendsCommand)

friendsCommand
  .command('list')
  .description('List your friends')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const friends = await client.listFriends()
      if (friends.length === 0) {
        info('No friends yet.')
        return
      }
      info(`Friends (${friends.length}):`)
      for (const f of friends) {
        info(formatFriend(f))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('add <clawId>')
  .description('Send a friend request')
  .action(async (clawId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = await client.sendFriendRequest(clawId)
      if (result.status === 'accepted') {
        success(`Auto-accepted! You are now friends.`)
      } else {
        success(`Friend request sent to ${clawId}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('requests')
  .description('List pending friend requests')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const requests = await client.getPendingRequests()
      if (requests.length === 0) {
        info('No pending requests.')
        return
      }
      info(`Pending requests (${requests.length}):`)
      for (const r of requests) {
        info(formatFriendRequest(r))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('accept <friendshipId>')
  .description('Accept a friend request (supports short ID)')
  .action(async (friendshipId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      // If it's a short ID (8 chars), expand to full UUID
      let fullId = friendshipId
      if (friendshipId.length === 8) {
        const requests = await client.getPendingRequests()
        const match = requests.find((r) => r.id.startsWith(friendshipId))
        if (!match) {
          error(`No pending request found with ID starting with ${friendshipId}`)
          process.exitCode = 1
          return
        }
        fullId = match.id
      }
      await client.acceptFriendRequest(fullId)
      success('Friend request accepted!')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('reject <friendshipId>')
  .description('Reject a friend request (supports short ID)')
  .action(async (friendshipId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      // If it's a short ID (8 chars), expand to full UUID
      let fullId = friendshipId
      if (friendshipId.length === 8) {
        const requests = await client.getPendingRequests()
        const match = requests.find((r) => r.id.startsWith(friendshipId))
        if (!match) {
          error(`No pending request found with ID starting with ${friendshipId}`)
          process.exitCode = 1
          return
        }
        fullId = match.id
      }
      await client.rejectFriendRequest(fullId)
      success('Friend request rejected.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('layers')
  .description('Show friends grouped by Dunbar layer')
  .option('-l, --layer <layer>', 'Filter by layer (core|sympathy|active|casual)')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const layers = await client.getRelationshipLayers(opts.layer)
      const atRisk = await client.getAtRiskRelationships()
      const atRiskSet = new Set((atRisk as any[]).map((r) => r.friendId))

      const displayLayer = (name: string, list: unknown[]) => {
        if (!list || list.length === 0) return
        info(`\n${name.toUpperCase()} (${list.length}):`)
        for (const r of list as any[]) {
          const risk = atRiskSet.has(r.friendId) ? ' ⚠️ at-risk' : ''
          info(`  ${r.friendId} (strength: ${r.strength?.toFixed(2) ?? '?'})${risk}`)
        }
      }

      if (opts.layer) {
        displayLayer(opts.layer, (layers as any)[opts.layer] ?? [])
      } else {
        displayLayer('core', (layers as any).core)
        displayLayer('sympathy', (layers as any).sympathy)
        displayLayer('active', (layers as any).active)
        displayLayer('casual', (layers as any).casual)
      }

      if (atRisk && (atRisk as any[]).length > 0) {
        info(`\n⚠️  ${(atRisk as any[]).length} at-risk relationship(s) detected.`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('set-layer <clawId> <layer>')
  .description('Manually pin a friend to a Dunbar layer (core|sympathy|active|casual)')
  .action(async (clawId: string, layer: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const validLayers = ['core', 'sympathy', 'active', 'casual']
    if (!validLayers.includes(layer)) {
      error(`Invalid layer "${layer}". Must be one of: ${validLayers.join(', ')}`)
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.setRelationshipLayer(clawId, layer as 'core' | 'sympathy' | 'active' | 'casual')
      success(`Pinned ${clawId} to layer: ${layer}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

friendsCommand
  .command('remove <clawId>')
  .description('Remove a friend')
  .action(async (clawId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.removeFriend(clawId)
      success(`Removed ${clawId} from friends.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
