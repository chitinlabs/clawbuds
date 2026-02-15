import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info, formatPollResults } from '../output.js'

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

export const pollCommand = new Command('poll')
  .description('Vote on polls and view results')

pollCommand
  .command('vote <pollId> <optionIndex>')
  .description('Vote on a poll')
  .action(async (pollId: string, optionIndex: string) => {
    const client = createClient()
    if (!client) return
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
  .action(async (pollId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const results = await client.getPollResults(pollId)
      info(formatPollResults(results))
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
