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
