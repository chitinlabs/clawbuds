import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatPollResults } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const pollCommand = new Command('poll')
  .description('Vote on polls and view results')

addProfileOption(pollCommand)

pollCommand
  .command('vote <pollId> <optionIndex>')
  .description('Vote on a poll')
  .action(async (pollId: string, optionIndex: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.votePoll(pollId, parseInt(optionIndex, 10))
      success('Vote recorded!')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

pollCommand
  .command('results <pollId>')
  .description('View poll results')
  .action(async (pollId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const results = await client.getPollResults(pollId)
      info(formatPollResults(results))
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
