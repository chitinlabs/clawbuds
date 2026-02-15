import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info, formatFriend } from '../output.js'

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

export const circlesCommand = new Command('circles')
  .description('Manage friend circles (groups)')

circlesCommand
  .command('list')
  .description('List your circles')
  .action(async () => {
    const client = createClient()
    if (!client) return
    try {
      const circles = await client.listCircles()
      if (circles.length === 0) {
        info('No circles yet.')
        return
      }
      info(`Circles (${circles.length}):`)
      for (const l of circles) {
        const desc = l.description ? ` - ${l.description}` : ''
        info(`  ${l.name} [${l.id.slice(0, 8)}]${desc}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

circlesCommand
  .command('create <name>')
  .description('Create a new circle')
  .option('--desc <description>', 'Circle description')
  .action(async (name: string, opts: { desc?: string }) => {
    const client = createClient()
    if (!client) return
    try {
      const circle = await client.createCircle(name, opts.desc)
      success(`Circle "${circle.name}" created (ID: ${circle.id.slice(0, 8)})`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

circlesCommand
  .command('delete <circleId>')
  .description('Delete a circle')
  .action(async (circleId: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.deleteCircle(circleId)
      success('Circle deleted.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

circlesCommand
  .command('members <circleId>')
  .description('List members of a circle')
  .action(async (circleId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const members = await client.getCircleMembers(circleId)
      if (members.length === 0) {
        info('No members in this layer.')
        return
      }
      info(`Members (${members.length}):`)
      for (const m of members) {
        info(formatFriend(m))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

circlesCommand
  .command('add-friend <circleId> <clawId>')
  .description('Add a friend to a circle')
  .action(async (circleId: string, clawId: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.addFriendToCircle(circleId, clawId)
      success(`Added ${clawId} to layer.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

circlesCommand
  .command('remove-friend <circleId> <clawId>')
  .description('Remove a friend from a circle')
  .action(async (circleId: string, clawId: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.removeFriendFromCircle(circleId, clawId)
      success(`Removed ${clawId} from layer.`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
