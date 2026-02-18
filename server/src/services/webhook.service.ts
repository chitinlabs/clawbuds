import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import type { EventBus, EventName, EventMap } from './event-bus.js'
import type { IWebhookRepository, WebhookProfile, WebhookDeliveryProfile } from '../db/repositories/interfaces/webhook.repository.interface.js'
import { WebhookError } from '../db/repositories/interfaces/webhook.repository.interface.js'

export type {
  WebhookProfile,
  WebhookProfilePublic,
  WebhookDeliveryProfile,
} from '../db/repositories/interfaces/webhook.repository.interface.js'

export { toPublicWebhookProfile } from '../db/repositories/interfaces/webhook.repository.interface.js'

export { WebhookError } from '../db/repositories/interfaces/webhook.repository.interface.js'

export interface CreateWebhookInput {
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url?: string
  events?: string[]
}

export interface UpdateWebhookInput {
  url?: string
  events?: string[]
  active?: boolean
  name?: string
}

const CIRCUIT_BREAKER_THRESHOLD = 10
const MAX_RETRIES = 3
const RETRY_DELAYS = [10_000, 60_000, 300_000] // 10s, 60s, 300s
const HTTP_TIMEOUT = 10_000 // 10s
const MAX_RESPONSE_BODY = 1024 // 1KB

/**
 * Validate webhook URL to prevent SSRF attacks.
 * Blocks internal network addresses and cloud metadata services.
 */
function validateWebhookUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new WebhookError('INVALID_URL', 'Invalid URL format')
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new WebhookError('FORBIDDEN_PROTOCOL', 'Only HTTP and HTTPS protocols are allowed')
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    throw new WebhookError('FORBIDDEN_URL', 'Cannot use localhost URLs')
  }

  // Block private IPv4 ranges
  const privateIpv4Patterns = [
    /^127\./,                      // 127.0.0.0/8 - loopback
    /^10\./,                       // 10.0.0.0/8 - private
    /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12 - private
    /^192\.168\./,                 // 192.168.0.0/16 - private
    /^169\.254\./,                 // 169.254.0.0/16 - link-local
  ]

  if (privateIpv4Patterns.some((pattern) => pattern.test(hostname))) {
    throw new WebhookError('FORBIDDEN_URL', 'Cannot use internal network URLs')
  }

  // Block IPv6 private addresses (strip brackets if present)
  const ipv6Host = hostname.replace(/^\[|\]$/g, '')
  const privateIpv6Patterns = [
    /^::1$/,        // localhost
    /^0000:0000:0000:0000:0000:0000:0000:0001$/,  // localhost expanded
    /^fe80:/,       // link-local
    /^fc00:/,       // unique local
    /^fd00:/,       // unique local
  ]

  if (privateIpv6Patterns.some((pattern) => pattern.test(ipv6Host))) {
    throw new WebhookError('FORBIDDEN_URL', 'Cannot use internal network URLs')
  }

  // Block cloud metadata services
  const blockedHosts = [
    '169.254.169.254',           // AWS/Azure/GCP metadata
    'metadata.google.internal',  // GCP metadata
    'metadata',                  // Generic metadata
  ]

  if (blockedHosts.includes(hostname)) {
    throw new WebhookError('FORBIDDEN_URL', 'Cannot access metadata services')
  }

  // Ensure hostname is not an IP in certain ranges
  // This catches IPs that might bypass the string patterns
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number)

    // Check ranges
    if (
      octets[0] === 127 ||                                           // 127.x.x.x
      octets[0] === 10 ||                                            // 10.x.x.x
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||  // 172.16-31.x.x
      (octets[0] === 192 && octets[1] === 168) ||                   // 192.168.x.x
      (octets[0] === 169 && octets[1] === 254)                      // 169.254.x.x
    ) {
      throw new WebhookError('FORBIDDEN_URL', 'Cannot use internal network IP addresses')
    }
  }
}

export class WebhookService {
  private listeners: Map<EventName, (data: unknown) => void> = new Map()

  constructor(
    private webhookRepository: IWebhookRepository,
    private eventBus?: EventBus,
  ) {
    if (eventBus) {
      this.subscribeToEvents(eventBus)
    }
  }

  async create(input: CreateWebhookInput): Promise<WebhookProfile> {
    if (input.type === 'outgoing' && !input.url) {
      throw new WebhookError('MISSING_URL', 'Outgoing webhook requires a URL')
    }

    // Validate URL for outgoing webhooks
    if (input.type === 'outgoing' && input.url) {
      validateWebhookUrl(input.url)
    }

    const id = randomUUID()
    const secret = randomUUID()
    const events = input.events || ['*']

    return await this.webhookRepository.create({
      id,
      clawId: input.clawId,
      type: input.type,
      name: input.name,
      url: input.url || null,
      secret,
      events,
    })
  }

  async findById(id: string): Promise<WebhookProfile | null> {
    return this.webhookRepository.findById(id)
  }

  async listByClawId(clawId: string): Promise<WebhookProfile[]> {
    return this.webhookRepository.listByClawId(clawId)
  }

  async update(id: string, clawId: string, input: UpdateWebhookInput): Promise<WebhookProfile> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (existing.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    // Validate URL if it's being updated
    if (input.url !== undefined && input.url && existing.type === 'outgoing') {
      validateWebhookUrl(input.url)
    }

    return await this.webhookRepository.update(id, input)
  }

  async delete(id: string, clawId: string): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (existing.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    await this.webhookRepository.delete(id)
  }

  async getDeliveries(webhookId: string, clawId: string, limit = 20): Promise<WebhookDeliveryProfile[]> {
    const webhook = await this.findById(webhookId)
    if (!webhook) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (webhook.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    return await this.webhookRepository.getDeliveries(webhookId, limit)
  }

  generateSignature(secret: string, payload: string): string {
    return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  }

  verifySignature(secret: string, payload: string, signature: string): boolean {
    const expected = this.generateSignature(secret, payload)
    if (expected.length !== signature.length) return false
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  }

  async sendTestEvent(webhookId: string, clawId: string): Promise<WebhookDeliveryProfile> {
    const webhook = await this.findById(webhookId)
    if (!webhook) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (webhook.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }
    if (webhook.type !== 'outgoing') {
      throw new WebhookError('INVALID_TYPE', 'Only outgoing webhooks can send test events')
    }
    if (!webhook.url) {
      throw new WebhookError('MISSING_URL', 'Webhook URL not configured')
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery from ClawBuds' },
    }

    return this.deliver(webhook, 'test', testPayload)
  }

  async deliver(
    webhook: WebhookProfile,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookDeliveryProfile> {
    if (!webhook.url) {
      throw new WebhookError('MISSING_URL', 'Webhook URL not configured')
    }

    const deliveryId = randomUUID()
    const payloadStr = JSON.stringify(payload)
    const signature = this.generateSignature(webhook.secret, payloadStr)
    const timestamp = String(Math.floor(Date.now() / 1000))

    const start = Date.now()
    let statusCode: number | null = null
    let responseBody: string | null = null
    let success = false

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT)

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ClawBuds-Event': eventType,
          'X-ClawBuds-Signature': signature,
          'X-ClawBuds-Delivery': deliveryId,
          'X-ClawBuds-Timestamp': timestamp,
        },
        body: payloadStr,
        signal: controller.signal,
      })

      clearTimeout(timeout)
      statusCode = response.status
      const body = await response.text()
      responseBody = body.slice(0, MAX_RESPONSE_BODY)
      success = response.ok
    } catch (err) {
      responseBody = err instanceof Error ? err.message : 'Unknown error'
    }

    const durationMs = Date.now() - start

    // Record delivery
    const delivery = await this.webhookRepository.recordDelivery({
      id: deliveryId,
      webhookId: webhook.id,
      eventType,
      payload: payloadStr,
      statusCode,
      responseBody,
      durationMs,
      success,
    })

    // Update webhook status
    if (success) {
      await this.webhookRepository.updateWebhookStatus(webhook.id, {
        lastTriggeredAt: new Date().toISOString(),
        lastStatusCode: statusCode,
        failureCount: 0,
      })
    } else {
      const newFailureCount = webhook.failureCount + 1
      const shouldDisable = newFailureCount >= CIRCUIT_BREAKER_THRESHOLD
      await this.webhookRepository.updateWebhookStatus(webhook.id, {
        lastTriggeredAt: new Date().toISOString(),
        lastStatusCode: statusCode,
        failureCount: newFailureCount,
        active: !shouldDisable,
      })
    }

    return delivery
  }

  async deliverWithRetry(
    webhook: WebhookProfile,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let lastDelivery = await this.deliver(webhook, eventType, payload)
    if (lastDelivery.success) return

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Refresh webhook to check if it was disabled by circuit breaker
      const current = await this.findById(webhook.id)
      if (!current || !current.active) return

      await sleep(RETRY_DELAYS[attempt])
      lastDelivery = await this.deliver(current, eventType, payload)
      if (lastDelivery.success) return
    }
  }

  async dispatchEvent<K extends EventName>(eventType: K, data: EventMap[K]): Promise<void> {
    const recipientIds = getRecipientIds(data)
    if (recipientIds.length === 0) return

    for (const recipientId of recipientIds) {
      const webhooks = await this.webhookRepository.getActiveWebhooksForRecipient(recipientId)

      for (const webhook of webhooks) {
        const events = webhook.events

        // Check if webhook subscribes to this event type
        if (!events.includes('*') && !events.includes(eventType)) {
          continue
        }

        const payload = {
          event: eventType,
          timestamp: new Date().toISOString(),
          data,
        }

        // Fire and forget with retry
        this.deliverWithRetry(webhook, eventType, payload).catch(() => {
          // Silently ignore - delivery failures are recorded in webhook_deliveries
        })
      }
    }
  }

  private subscribeToEvents(eventBus: EventBus): void {
    const eventNames: EventName[] = [
      'message.new',
      'message.edited',
      'message.deleted',
      'reaction.added',
      'reaction.removed',
      'poll.voted',
      'friend.request',
      'friend.accepted',
      'group.invited',
      'group.joined',
      'group.left',
      'group.removed',
      'e2ee.key_updated',
    ]

    for (const eventName of eventNames) {
      const listener = (data: unknown) => {
        this.dispatchEvent(eventName, data as EventMap[typeof eventName]).catch(() => {
          // Silently ignore dispatch errors
        })
      }
      this.listeners.set(eventName, listener)
      eventBus.on(eventName, listener as (data: EventMap[typeof eventName]) => void)
    }
  }

  unsubscribeFromEvents(): void {
    if (!this.eventBus) return
    for (const [eventName, listener] of this.listeners) {
      this.eventBus.off(eventName, listener as (data: EventMap[typeof eventName]) => void)
    }
    this.listeners.clear()
  }
}

function getRecipientIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []

  // friend.accepted has recipientIds (array of two)
  if ('recipientIds' in data) {
    return (data as { recipientIds: string[] }).recipientIds
  }

  if ('recipientId' in data) {
    return [(data as { recipientId: string }).recipientId]
  }

  return []
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
