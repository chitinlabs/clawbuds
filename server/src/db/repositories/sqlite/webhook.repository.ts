import type Database from 'better-sqlite3'
import type {
  IWebhookRepository,
  WebhookProfile,
  WebhookDeliveryProfile,
  CreateWebhookInput,
  UpdateWebhookInput,
  RecordDeliveryInput,
  UpdateWebhookStatusInput,
} from '../interfaces/webhook.repository.interface.js'
import { WebhookError } from '../interfaces/webhook.repository.interface.js'

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

export class SqliteWebhookRepository implements IWebhookRepository {
  constructor(private db: Database.Database) {}

  async create(input: CreateWebhookInput): Promise<WebhookProfile> {
    const eventsJson = JSON.stringify(input.events)

    try {
      const row = this.db
        .prepare(
          `INSERT INTO webhooks (id, claw_id, type, name, url, secret, events)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .get(input.id, input.clawId, input.type, input.name, input.url, input.secret, eventsJson) as WebhookRow

      return rowToProfile(row)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new WebhookError('DUPLICATE_NAME', 'A webhook with this name already exists')
      }
      throw err
    }
  }

  async findById(id: string): Promise<WebhookProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM webhooks WHERE id = ?')
      .get(id) as WebhookRow | undefined
    return row ? rowToProfile(row) : null
  }

  async listByClawId(clawId: string): Promise<WebhookProfile[]> {
    const rows = this.db
      .prepare('SELECT * FROM webhooks WHERE claw_id = ? ORDER BY created_at DESC')
      .all(clawId) as WebhookRow[]
    return rows.map(rowToProfile)
  }

  async update(id: string, input: UpdateWebhookInput): Promise<WebhookProfile> {
    const updates: string[] = []
    const values: unknown[] = []

    if (input.url !== undefined) {
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
        updates.push('failure_count = 0')
      }
    }
    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }

    if (updates.length === 0) {
      const existing = await this.findById(id)
      if (!existing) {
        throw new WebhookError('NOT_FOUND', 'Webhook not found')
      }
      return existing
    }

    values.push(id)
    const row = this.db
      .prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .get(...values) as WebhookRow

    return rowToProfile(row)
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id)
  }

  async getDeliveries(webhookId: string, limit: number): Promise<WebhookDeliveryProfile[]> {
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

  async findAllDeliveries(limit: number): Promise<WebhookDeliveryProfile[]> {
    const stmt = this.db.prepare(
      `SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?`
    )
    const rows = stmt.all(limit) as WebhookDeliveryRow[]
    return Promise.resolve(rows.map(deliveryRowToProfile))
  }

  async recordDelivery(input: RecordDeliveryInput): Promise<WebhookDeliveryProfile> {
    const row = this.db
      .prepare(
        `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status_code, response_body, duration_ms, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        input.id,
        input.webhookId,
        input.eventType,
        input.payload,
        input.statusCode,
        input.responseBody,
        input.durationMs,
        input.success ? 1 : 0,
      ) as WebhookDeliveryRow

    return deliveryRowToProfile(row)
  }

  async updateWebhookStatus(id: string, input: UpdateWebhookStatusInput): Promise<void> {
    const updates: string[] = ['last_triggered_at = ?', 'last_status_code = ?']
    const values: unknown[] = [input.lastTriggeredAt, input.lastStatusCode]

    if (input.failureCount !== undefined) {
      updates.push('failure_count = ?')
      values.push(input.failureCount)
    }
    if (input.active !== undefined) {
      updates.push('active = ?')
      values.push(input.active ? 1 : 0)
    }

    values.push(id)
    this.db
      .prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)
  }

  async getActiveWebhooksForRecipient(recipientId: string): Promise<WebhookProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM webhooks
         WHERE claw_id = ? AND type = 'outgoing' AND active = 1`,
      )
      .all(recipientId) as WebhookRow[]

    return rows.map(rowToProfile)
  }
}
