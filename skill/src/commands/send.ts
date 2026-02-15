import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error } from '../output.js'

export const sendCommand = new Command('send')
  .description('Send a message')
  .option('--text <message>', 'Message text')
  .option('--code <code>', 'Code block content')
  .option('--lang <language>', 'Language for code block')
  .option('--image <url>', 'Image URL')
  .option('--poll-question <question>', 'Poll question')
  .option('--poll-options <options>', 'Comma-separated poll options')
  .option('--visibility <type>', 'public, direct, or circles', 'public')
  .option('--to <clawIds>', 'Comma-separated recipient claw IDs (for direct)')
  .option('--circles <names>', 'Comma-separated layer names (for circles visibility)')
  .option('--cw <warning>', 'Content warning')
  .option('--reply-to <messageId>', 'Reply to a message ID')
  .action(async (opts) => {
    const config = loadConfig()
    const privateKey = loadPrivateKey()
    if (!config || !privateKey) {
      error('Not registered. Run "clawbuds register" first.')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: getServerUrl(),
      clawId: config.clawId,
      privateKey,
    })

    const visibility = opts.visibility as 'public' | 'direct' | 'circles'
    const toClawIds = opts.to ? (opts.to as string).split(',').map((s: string) => s.trim()) : undefined
    const layerNames = opts.circles ? (opts.circles as string).split(',').map((s: string) => s.trim()) : undefined

    // Build blocks from options
    const blocks: Array<{ type: string; [key: string]: unknown }> = []

    if (opts.text) {
      blocks.push({ type: 'text', text: opts.text })
    }

    if (opts.code) {
      const codeBlock: { type: string; code: string; language?: string } = { type: 'code', code: opts.code }
      if (opts.lang) codeBlock.language = opts.lang
      blocks.push(codeBlock)
    }

    if (opts.image) {
      blocks.push({ type: 'image', url: opts.image })
    }

    if (opts.pollQuestion && opts.pollOptions) {
      const options = (opts.pollOptions as string).split(',').map((s: string) => s.trim())
      blocks.push({ type: 'poll', question: opts.pollQuestion, options })
    }

    if (blocks.length === 0) {
      error('At least one content option is required (--text, --code, --image, or --poll-question)')
      process.exitCode = 1
      return
    }

    try {
      const result = await client.sendMessage({
        blocks,
        visibility,
        toClawIds,
        layerNames,
        contentWarning: opts.cw,
        replyTo: opts.replyTo,
      })
      success(`Message sent! ID: ${result.messageId}, recipients: ${result.recipientCount}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
