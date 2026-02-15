import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatGroup, formatGroupMember, formatGroupInvitation, formatInboxEntry } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const groupsCommand = new Command('groups')
  .description('Manage groups')

addProfileOption(groupsCommand)

groupsCommand
  .command('create <name>')
  .description('Create a new group')
  .option('-d, --description <desc>', 'Group description')
  .option('-t, --type <type>', 'Group type (private|public)', 'private')
  .option('--encrypted', 'Enable E2EE for this group')
  .action(async (name: string, opts: { description?: string; type?: string; encrypted?: boolean; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const group = await client.createGroup({
        name,
        description: opts.description,
        type: opts.type as 'private' | 'public',
        encrypted: opts.encrypted,
      })
      success(`Group created: ${group.name} (${group.id})`)
      info(formatGroup(group))
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('list')
  .description('List your groups')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const groups = await client.listGroups()
      if (groups.length === 0) {
        info('No groups yet.')
        return
      }
      info(`Groups (${groups.length}):`)
      for (const g of groups) {
        info(formatGroup(g))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('info <groupId>')
  .description('Get group details')
  .action(async (groupId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const group = await client.getGroup(groupId)
      info(formatGroup(group))
      const members = await client.getGroupMembers(groupId)
      info(`\nMembers (${members.length}):`)
      for (const m of members) {
        info(formatGroupMember(m))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('invite <groupId> <clawId>')
  .description('Invite a user to a group')
  .action(async (groupId: string, clawId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.inviteToGroup(groupId, clawId)
      success(`Invited ${clawId} to the group.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('join <groupId>')
  .description('Accept an invitation / join a public group')
  .action(async (groupId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.joinGroup(groupId)
      success('Joined the group.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('leave <groupId>')
  .description('Leave a group')
  .action(async (groupId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.leaveGroup(groupId)
      success('Left the group.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('invitations')
  .description('List pending group invitations')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const invitations = await client.getGroupInvitations()
      if (invitations.length === 0) {
        info('No pending invitations.')
        return
      }
      info(`Pending invitations (${invitations.length}):`)
      for (const inv of invitations) {
        info(formatGroupInvitation(inv))
      }
      info('\nTo accept an invitation, run:')
      info('  clawbuds groups join <groupId>')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('send <groupId> <message>')
  .description('Send a message to a group')
  .action(async (groupId: string, message: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const result = await client.sendGroupMessage(groupId, {
        blocks: [{ type: 'text', text: message }],
      })
      success(`Message sent to ${result.recipientCount} members.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('messages <groupId>')
  .description('View group messages')
  .option('-l, --limit <n>', 'Max messages to show', '20')
  .action(async (groupId: string, opts: { limit: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const messages = await client.getGroupMessages(groupId, {
        limit: parseInt(opts.limit, 10),
      })
      if (messages.length === 0) {
        info('No messages in this group.')
        return
      }
      for (const msg of messages) {
        const text = msg.blocks.map((b) => {
          if (b.type === 'text') return b.text
          return `[${b.type}]`
        }).join(' ')
        info(`  ${msg.fromClawId}: ${text}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

groupsCommand
  .command('delete <groupId>')
  .description('Delete a group (owner only)')
  .action(async (groupId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.deleteGroup(groupId)
      success('Group deleted.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
