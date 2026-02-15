import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info } from '../output.js'
import type { AutonomyLevel } from '../types.js'

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

const VALID_LEVELS: AutonomyLevel[] = ['notifier', 'drafter', 'autonomous', 'delegator']

async function getAutonomyConfig(): Promise<void> {
  const client = createClient()
  if (!client) return
  try {
    const config = await client.getAutonomy()
    info('Autonomy Configuration:')
    info(`  Current Level: ${config.autonomyLevel}`)
    info(`  Default Level: ${config.autonomyConfig.defaultLevel}`)

    if (config.autonomyConfig.perFriend && Object.keys(config.autonomyConfig.perFriend).length > 0) {
      info('  Per-Friend Levels:')
      for (const [clawId, level] of Object.entries(config.autonomyConfig.perFriend)) {
        info(`    ${clawId}: ${level}`)
      }
    }

    if (config.autonomyConfig.escalationKeywords && config.autonomyConfig.escalationKeywords.length > 0) {
      info(`  Escalation Keywords: ${config.autonomyConfig.escalationKeywords.join(', ')}`)
    }

    info('')
    info('Available Levels:')
    info('  - notifier:   Notify owner when messages arrive (L0)')
    info('  - drafter:    Draft replies for owner approval (L1)')
    info('  - autonomous: Respond autonomously within guidelines (L2)')
    info('  - delegator:  Delegate tasks to other agents (L3)')
  } catch (err) {
    error((err as Error).message)
    process.exitCode = 1
  }
}

export const autonomyCommand = new Command('autonomy')
  .description('Manage autonomy level and configuration')
  .action(async () => {
    // Default action: same as 'get'
    await getAutonomyConfig()
  })

autonomyCommand
  .command('get')
  .description('View current autonomy configuration')
  .action(getAutonomyConfig)

autonomyCommand
  .command('set')
  .description('Set autonomy level')
  .option('-l, --level <level>', 'Set autonomy level (notifier, drafter, autonomous, delegator)')
  .option('--default <level>', 'Set default level for autonomyConfig')
  .action(async (options: {
    level?: string
    default?: string
  }) => {
    const client = createClient()
    if (!client) return

    if (!options.level && !options.default) {
      error('Must specify --level or --default')
      process.exitCode = 1
      return
    }

    const updates: {
      autonomyLevel?: AutonomyLevel
      autonomyConfig?: {
        defaultLevel: AutonomyLevel
        perFriend?: Record<string, AutonomyLevel>
        escalationKeywords?: string[]
      }
    } = {}

    if (options.level) {
      if (!VALID_LEVELS.includes(options.level as AutonomyLevel)) {
        error(`Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}`)
        process.exitCode = 1
        return
      }
      updates.autonomyLevel = options.level as AutonomyLevel
    }

    if (options.default) {
      if (!VALID_LEVELS.includes(options.default as AutonomyLevel)) {
        error(`Invalid default level. Must be one of: ${VALID_LEVELS.join(', ')}`)
        process.exitCode = 1
        return
      }
      updates.autonomyConfig = {
        defaultLevel: options.default as AutonomyLevel,
      }
    }

    try {
      const config = await client.updateAutonomy(updates)
      success('Autonomy configuration updated!')
      info(`  Current Level: ${config.autonomyLevel}`)
      info(`  Default Level: ${config.autonomyConfig.defaultLevel}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
