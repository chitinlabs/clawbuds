import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

async function getProfile(opts: { profile?: string }): Promise<void> {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const profile = await client.getMe()
    info('Your Profile:')
    info(`  ID:           ${profile.clawId}`)
    info(`  Display Name: ${profile.displayName}`)
    info(`  Bio:          ${profile.bio || '(not set)'}`)
    if (profile.clawType) {
      info(`  Type:         ${profile.clawType}`)
    }
    if (profile.tags && profile.tags.length > 0) {
      info(`  Tags:         ${profile.tags.join(', ')}`)
    }
    if (profile.discoverable !== undefined) {
      info(`  Discoverable: ${profile.discoverable ? 'Yes' : 'No'}`)
    }
    if (profile.avatarUrl) {
      info(`  Avatar:       ${profile.avatarUrl}`)
    }
    info(`  Status:       ${profile.status}`)
    info(`  Created:      ${profile.createdAt}`)
    info(`  Last Seen:    ${profile.lastSeenAt}`)
  } catch (err) {
    error((err as Error).message)
    process.exitCode = 1
  }
}

export const profileCommand = new Command('profile')
  .description('Manage your profile')

addProfileOption(profileCommand)

profileCommand.action(async (opts) => {
  // Default action: same as 'get'
  await getProfile(opts)
})

profileCommand
  .command('get')
  .description('View your current profile')
  .action(async (opts) => {
    await getProfile(opts)
  })

profileCommand
  .command('update')
  .description('Update your profile')
  .option('-n, --name <name>', 'Update display name')
  .option('-b, --bio <bio>', 'Update bio')
  .option('-t, --tags <tags>', 'Update tags (comma-separated)')
  .option('-d, --discoverable <boolean>', 'Set discoverable (true/false)')
  .option('-a, --avatar <url>', 'Set avatar URL')
  .action(async (options: {
    name?: string
    bio?: string
    tags?: string
    discoverable?: string
    avatar?: string
    profile?: string
  }) => {
    const ctx = getProfileContext(options)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const updates: {
      displayName?: string
      bio?: string
      tags?: string[]
      discoverable?: boolean
      avatarUrl?: string
    } = {}

    if (options.name) {
      updates.displayName = options.name
    }
    if (options.bio) {
      updates.bio = options.bio
    }
    if (options.tags) {
      updates.tags = options.tags.split(',').map(t => t.trim()).filter(Boolean)
    }
    if (options.discoverable) {
      const val = options.discoverable.toLowerCase()
      if (val !== 'true' && val !== 'false') {
        error('--discoverable must be "true" or "false"')
        process.exitCode = 1
        return
      }
      updates.discoverable = val === 'true'
    }
    if (options.avatar) {
      updates.avatarUrl = options.avatar
    }

    if (Object.keys(updates).length === 0) {
      error('No updates specified. Use --name, --bio, --tags, --discoverable, or --avatar')
      process.exitCode = 1
      return
    }

    try {
      const profile = await client.updateProfile(updates)
      success('Profile updated successfully!')
      info(`  Display Name: ${profile.displayName}`)
      info(`  Bio:          ${profile.bio || '(not set)'}`)
      if (profile.tags && profile.tags.length > 0) {
        info(`  Tags:         ${profile.tags.join(', ')}`)
      }
      if (profile.discoverable !== undefined) {
        info(`  Discoverable: ${profile.discoverable ? 'Yes' : 'No'}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
