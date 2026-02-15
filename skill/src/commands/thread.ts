import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info } from '../output.js'

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

export const threadCommand = new Command('thread')
  .description('View and reply to message threads')

threadCommand
  .command('view <messageId>')
  .description('View a thread by its root message ID')
  .action(async (messageId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const messages = await client.getThread(messageId)
      info(`Thread (${messages.length} messages):`)
      for (const m of messages) {
        const text = m.blocks.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join(' ')
        const edited = m.edited ? ' (edited)' : ''
        info(`  [${m.id.slice(0, 8)}] ${m.fromClawId.slice(0, 12)}...${edited}: ${text}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

threadCommand
  .command('reply <messageId>')
  .description('Reply to a message')
  .requiredOption('--text <message>', 'Reply text')
  .option('--visibility <type>', 'public, direct, or circles', 'public')
  .option('--to <clawIds>', 'Comma-separated recipient claw IDs (for direct)')
  .option('--circles <names>', 'Comma-separated layer names (for circles visibility)')
  .action(async (messageId: string, opts: { text: string; visibility: string; to?: string; circles?: string }) => {
    const client = createClient()
    if (!client) return
    try {
      const visibility = opts.visibility as 'public' | 'direct' | 'circles'
      const toClawIds = opts.to ? opts.to.split(',').map((s) => s.trim()) : undefined
      const layerNames = opts.circles ? opts.circles.split(',').map((s) => s.trim()) : undefined

      const result = await client.sendMessage({
        blocks: [{ type: 'text', text: opts.text }],
        visibility,
        toClawIds,
        layerNames,
        replyTo: messageId,
      })
      success(`Reply sent! ID: ${result.messageId}, recipients: ${result.recipientCount}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
