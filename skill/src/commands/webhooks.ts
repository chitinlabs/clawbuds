import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error, info, formatWebhook } from '../output.js'

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

export const webhooksCommand = new Command('webhooks')
  .description('Manage webhooks')

webhooksCommand
  .command('create <name>')
  .description('Create a new webhook')
  .requiredOption('-u, --url <url>', 'Webhook URL')
  .option('-t, --type <type>', 'Webhook type (outgoing|incoming)', 'outgoing')
  .option('-s, --secret <secret>', 'HMAC secret for signing')
  .option('-e, --events <events>', 'Comma-separated event list', 'message.new')
  .action(async (name: string, opts: { url: string; type: string; secret?: string; events: string }) => {
    const client = createClient()
    if (!client) return
    try {
      const webhook = await client.createWebhook({
        name,
        url: opts.url,
        type: opts.type as 'outgoing' | 'incoming',
        secret: opts.secret,
        events: opts.events.split(',').map((e) => e.trim()),
      })
      success(`Webhook created: ${webhook.name} (${webhook.id})`)
      info(formatWebhook(webhook))
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

webhooksCommand
  .command('list')
  .description('List your webhooks')
  .action(async () => {
    const client = createClient()
    if (!client) return
    try {
      const webhooks = await client.listWebhooks()
      if (webhooks.length === 0) {
        info('No webhooks configured.')
        return
      }
      info(`Webhooks (${webhooks.length}):`)
      for (const w of webhooks) {
        info(formatWebhook(w))
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

webhooksCommand
  .command('delete <webhookId>')
  .description('Delete a webhook')
  .action(async (webhookId: string) => {
    const client = createClient()
    if (!client) return
    try {
      await client.deleteWebhook(webhookId)
      success('Webhook deleted.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

webhooksCommand
  .command('test <webhookId>')
  .description('Send a test delivery')
  .action(async (webhookId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const result = await client.testWebhook(webhookId)
      if (result.delivered) {
        success('Test delivery sent successfully.')
      } else {
        error('Test delivery failed.')
        process.exitCode = 1
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

webhooksCommand
  .command('deliveries <webhookId>')
  .description('View delivery log')
  .action(async (webhookId: string) => {
    const client = createClient()
    if (!client) return
    try {
      const deliveries = await client.getWebhookDeliveries(webhookId)
      if (deliveries.length === 0) {
        info('No deliveries yet.')
        return
      }
      info(`Deliveries (${deliveries.length}):`)
      for (const d of deliveries) {
        const status = d.success ? 'OK' : 'FAIL'
        const code = d.statusCode ?? '-'
        info(`  [${status}] ${d.event} -> ${code} (attempt ${d.attempt}) ${d.createdAt}`)
      }
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
