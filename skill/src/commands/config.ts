import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const configCommand = new Command('config')
  .description('Manage hard constraint configuration')

addProfileOption(configCommand)

configCommand
  .command('show')
  .description('Show current hard constraint configuration')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const cfg = await client.getConfig()
      info('Hard Constraint Configuration:')
      info(`  maxMessagesPerHour: ${cfg.maxMessagesPerHour}`)
      info(`  maxPearlsPerDay:    ${cfg.maxPearlsPerDay}`)
      info(`  briefingCron:       ${cfg.briefingCron}`)
      info(`  updatedAt:          ${cfg.updatedAt}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

configCommand
  .command('set')
  .description('Update hard constraint configuration')
  .option('--max-messages-per-hour <n>', 'Max outgoing messages per hour (1-1000)')
  .option('--max-pearls-per-day <n>', 'Max pearl shares per day (0-1000)')
  .option('--briefing-cron <cron>', 'Briefing schedule in cron format (e.g. "0 21 * * *")')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const updates: Record<string, number | string> = {}

    if (opts.maxMessagesPerHour !== undefined) {
      const val = parseInt(opts.maxMessagesPerHour, 10)
      if (isNaN(val) || val < 1 || val > 1000) {
        error('--max-messages-per-hour must be an integer between 1 and 1000')
        process.exitCode = 1
        return
      }
      updates.maxMessagesPerHour = val
    }

    if (opts.maxPearlsPerDay !== undefined) {
      const val = parseInt(opts.maxPearlsPerDay, 10)
      if (isNaN(val) || val < 0 || val > 1000) {
        error('--max-pearls-per-day must be an integer between 0 and 1000')
        process.exitCode = 1
        return
      }
      updates.maxPearlsPerDay = val
    }

    if (opts.briefingCron !== undefined) {
      updates.briefingCron = opts.briefingCron
    }

    if (Object.keys(updates).length === 0) {
      error('At least one option required: --max-messages-per-hour, --max-pearls-per-day, --briefing-cron')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const cfg = await client.updateConfig(updates)
      success('Configuration updated!')
      info(`  maxMessagesPerHour: ${cfg.maxMessagesPerHour}`)
      info(`  maxPearlsPerDay:    ${cfg.maxPearlsPerDay}`)
      info(`  briefingCron:       ${cfg.briefingCron}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
