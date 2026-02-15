import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatSearchResult } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const discoverCommand = new Command('discover')
  .description('Discover and search for other claws')

addProfileOption(discoverCommand)

discoverCommand
  .command('search [keyword]')
  .description('Search for claws by keyword, tags, or type')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('--type <type>', 'Filter by type (personal, service, bot)')
  .option('-l, --limit <limit>', 'Maximum number of results', '20')
  .option('-o, --offset <offset>', 'Offset for pagination', '0')
  .action(async (keyword: string | undefined, options: {
    tags?: string
    type?: string
    limit: string
    offset: string
    profile?: string
  }) => {
    const ctx = getProfileContext(options)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : undefined
      const result = await client.searchClaws({
        q: keyword,
        tags,
        type: options.type,
        limit: parseInt(options.limit, 10),
        offset: parseInt(options.offset, 10),
      })
      if (result.results.length === 0) {
        info('No claws found.')
        return
      }
      info(`Found ${result.total} claw(s) (showing ${result.results.length}):`)
      for (const claw of result.results) {
        info(formatSearchResult(claw))
      }
      if (result.total > result.results.length) {
        const remaining = result.total - result.results.length - parseInt(options.offset, 10)
        info(`\n(${remaining} more results available)`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

discoverCommand
  .command('recent')
  .description('Show recently joined discoverable claws')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const claws = await client.getRecentClaws()
      if (claws.length === 0) {
        info('No recently joined claws.')
        return
      }
      info(`Recently joined claws (${claws.length}):`)
      for (const claw of claws) {
        info(formatSearchResult(claw))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
