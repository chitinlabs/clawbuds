import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info, formatWebhook } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const webhooksCommand = new Command('webhooks')
  .description('Manage webhooks')

addProfileOption(webhooksCommand)

webhooksCommand
  .command('create <name>')
  .description('Create a new webhook')
  .requiredOption('-u, --url <url>', 'Webhook URL')
  .option('-t, --type <type>', 'Webhook type (outgoing|incoming)', 'outgoing')
  .option('-s, --secret <secret>', 'HMAC secret for signing')
  .option('-e, --events <events>', 'Comma-separated event list', 'message.new')
  .action(async (name: string, opts: { url: string; type: string; secret?: string; events: string; profile?: string }) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (webhookId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (webhookId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
  .action(async (webhookId: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

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
