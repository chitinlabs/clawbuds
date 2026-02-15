import type Database from 'better-sqlite3'
import { randomUUID, createHmac } from 'node:crypto'
import type { EventBus, EventName, EventMap } from './event-bus.js'

interface WebhookRow {
  id: string
  claw_id: string
  type: 'outgoing' | 'incoming'
  name: string
  url: string | null
  secret: string
  events: string
  active: number
  failure_count: number
  last_triggered_at: string | null
  last_status_code: number | null
  created_at: string
}

interface WebhookDeliveryRow {
  id: string
  webhook_id: string
  event_type: string
  payload: string
  status_code: number | null
  response_body: string | null
  duration_ms: number | null
  success: number
  created_at: string
}

export interface WebhookProfile {
  id: string
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url: string | null
  secret: string
  events: string[]
  active: boolean
  failureCount: number
  lastTriggeredAt: string | null
  lastStatusCode: number | null
  createdAt: string
}

export interface WebhookDeliveryProfile {
  id: string
  webhookId: string
  eventType: string
  payload: unknown
  statusCode: number | null
  responseBody: string | null
  durationMs: number | null
  success: boolean
  createdAt: string
}

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
    private db: Database.Database,
    private eventBus?: EventBus,
  ) {
    if (eventBus) {
      this.subscribeToEvents(eventBus)
    }
  }

  create(input: CreateWebhookInput): WebhookProfile {
    if (input.type === 'outgoing' && !input.url) {
      throw new WebhookError('MISSING_URL', 'Outgoing webhook requires a URL')
    }

    // Validate URL for outgoing webhooks
    if (input.type === 'outgoing' && input.url) {
      validateWebhookUrl(input.url)
    }

    const id = `whk_${randomUUID()}`
    const secret = randomUUID()
    const events = JSON.stringify(input.events || ['*'])

    let row: WebhookRow
    try {
      row = this.db
        .prepare(
          `INSERT INTO webhooks (id, claw_id, type, name, url, secret, events)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .get(id, input.clawId, input.type, input.name, input.url || null, secret, events) as WebhookRow
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new WebhookError('DUPLICATE_NAME', 'A webhook with this name already exists')
      }
      throw err
    }

    return rowToProfile(row)
  }

  findById(id: string): WebhookProfile | null {
    const row = this.db
      .prepare('SELECT * FROM webhooks WHERE id = ?')
      .get(id) as WebhookRow | undefined
    return row ? rowToProfile(row) : null
  }

  listByClawId(clawId: string): WebhookProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM webhooks WHERE claw_id = ? ORDER BY created_at DESC')
      .all(clawId) as WebhookRow[]
    return rows.map(rowToProfile)
  }

  update(id: string, clawId: string, input: UpdateWebhookInput): WebhookProfile {
    const existing = this.findById(id)
    if (!existing) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (existing.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (input.url !== undefined) {
      // Validate URL if it's being updated
      if (input.url && existing.type === 'outgoing') {
        validateWebhookUrl(input.url)
      }
      updates.push('url = ?')
      values.push(input.url)
    }
    if (input.events !== undefined) {
      updates.push('events = ?')
      values.push(JSON.stringify(input.events))
    }
    if (input.active !== undefined) {
      updates.push('active = ?')
      values.push(input.active ? 1 : 0)
      if (input.active) {
        // Reset failure count when re-enabling
        updates.push('failure_count = 0')
      }
    }
    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }

    if (updates.length === 0) {
      return existing
    }

    values.push(id)
    const row = this.db
      .prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .get(...values) as WebhookRow

    return rowToProfile(row)
  }

  delete(id: string, clawId: string): void {
    const existing = this.findById(id)
    if (!existing) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (existing.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id)
  }

  getDeliveries(webhookId: string, clawId: string, limit = 20): WebhookDeliveryProfile[] {
    const webhook = this.findById(webhookId)
    if (!webhook) {
      throw new WebhookError('NOT_FOUND', 'Webhook not found')
    }
    if (webhook.clawId !== clawId) {
      throw new WebhookError('FORBIDDEN', 'Not your webhook')
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE webhook_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(webhookId, limit) as WebhookDeliveryRow[]

    return rows.map(deliveryRowToProfile)
  }

  generateSignature(secret: string, payload: string): string {
    return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  }

  verifySignature(secret: string, payload: string, signature: string): boolean {
    const expected = this.generateSignature(secret, payload)
    return expected === signature
  }

  async sendTestEvent(webhookId: string, clawId: string): Promise<WebhookDeliveryProfile> {
    const webhook = this.findById(webhookId)
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

    const deliveryId = `dlv_${randomUUID()}`
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
    const deliveryRow = this.db
      .prepare(
        `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status_code, response_body, duration_ms, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(deliveryId, webhook.id, eventType, payloadStr, statusCode, responseBody, durationMs, success ? 1 : 0) as WebhookDeliveryRow

    // Update webhook status
    if (success) {
      this.db
        .prepare('UPDATE webhooks SET last_triggered_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\'), last_status_code = ?, failure_count = 0 WHERE id = ?')
        .run(statusCode, webhook.id)
    } else {
      const newFailureCount = webhook.failureCount + 1
      const shouldDisable = newFailureCount >= CIRCUIT_BREAKER_THRESHOLD
      this.db
        .prepare(
          `UPDATE webhooks SET
            last_triggered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            last_status_code = ?,
            failure_count = ?,
            active = ?
           WHERE id = ?`,
        )
        .run(statusCode, newFailureCount, shouldDisable ? 0 : 1, webhook.id)
    }

    return deliveryRowToProfile(deliveryRow)
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
      const current = this.findById(webhook.id)
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
      const webhooks = this.db
        .prepare(
          `SELECT * FROM webhooks
           WHERE claw_id = ? AND type = 'outgoing' AND active = 1`,
        )
        .all(recipientId) as WebhookRow[]

      for (const row of webhooks) {
        const webhook = rowToProfile(row)
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

function rowToProfile(row: WebhookRow): WebhookProfile {
  return {
    id: row.id,
    clawId: row.claw_id,
    type: row.type,
    name: row.name,
    url: row.url,
    secret: row.secret,
    events: JSON.parse(row.events) as string[],
    active: Boolean(row.active),
    failureCount: row.failure_count,
    lastTriggeredAt: row.last_triggered_at,
    lastStatusCode: row.last_status_code,
    createdAt: row.created_at,
  }
}

function deliveryRowToProfile(row: WebhookDeliveryRow): WebhookDeliveryProfile {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload) as unknown,
    statusCode: row.status_code,
    responseBody: row.response_body,
    durationMs: row.duration_ms,
    success: Boolean(row.success),
    createdAt: row.created_at,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class WebhookError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WebhookError'
  }
}
