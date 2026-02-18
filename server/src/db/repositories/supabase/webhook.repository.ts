import type { SupabaseClient } from '@supabase/supabase-js'
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
  events: string | string[]
  active: boolean
  failure_count: number
  last_triggered_at: string | null
  last_status_code: number | null
  created_at: string
}

interface WebhookDeliveryRow {
  id: string
  webhook_id: string
  event_type: string
  payload: string | unknown
  status_code: number | null
  response_body: string | null
  duration_ms: number | null
  success: boolean
  created_at: string
}

function rowToProfile(row: WebhookRow): WebhookProfile {
  const events = typeof row.events === 'string' ? JSON.parse(row.events) : row.events
  return {
    id: row.id,
    clawId: row.claw_id,
    type: row.type,
    name: row.name,
    url: row.url,
    secret: row.secret,
    events,
    active: row.active,
    failureCount: row.failure_count,
    lastTriggeredAt: row.last_triggered_at,
    lastStatusCode: row.last_status_code,
    createdAt: row.created_at,
  }
}

function deliveryRowToProfile(row: WebhookDeliveryRow): WebhookDeliveryProfile {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload,
    statusCode: row.status_code,
    responseBody: row.response_body,
    durationMs: row.duration_ms,
    success: row.success,
    createdAt: row.created_at,
  }
}

export class SupabaseWebhookRepository implements IWebhookRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(input: CreateWebhookInput): Promise<WebhookProfile> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .insert({
        id: input.id,
        claw_id: input.clawId,
        type: input.type,
        name: input.name,
        url: input.url,
        secret: input.secret,
        events: input.events, // PostgreSQL JSONB
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new WebhookError('DUPLICATE_NAME', 'A webhook with this name already exists')
      }
      throw error
    }

    if (!data) {
      throw new Error('Failed to create webhook: no data returned')
    }

    return rowToProfile(data as WebhookRow)
  }

  async findById(id: string): Promise<WebhookProfile | null> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data ? rowToProfile(data as WebhookRow) : null
  }

  async listByClawId(clawId: string): Promise<WebhookProfile[]> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('claw_id', clawId)
      .order('created_at', { ascending: false })
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => rowToProfile(row as WebhookRow))
  }

  async update(id: string, input: UpdateWebhookInput): Promise<WebhookProfile> {
    const updates: Record<string, unknown> = {}

    if (input.url !== undefined) {
      updates.url = input.url
    }
    if (input.events !== undefined) {
      updates.events = input.events
    }
    if (input.active !== undefined) {
      updates.active = input.active
      if (input.active) {
        updates.failure_count = 0
      }
    }
    if (input.name !== undefined) {
      updates.name = input.name
    }

    if (Object.keys(updates).length === 0) {
      const existing = await this.findById(id)
      if (!existing) {
        throw new WebhookError('NOT_FOUND', 'Webhook not found')
      }
      return existing
    }

    const { data, error } = await this.supabase
      .from('webhooks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
      .throwOnError()

    if (error) {
      throw error
    }

    return rowToProfile(data as WebhookRow)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('webhooks')
      .delete()
      .eq('id', id)
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async getDeliveries(webhookId: string, limit: number): Promise<WebhookDeliveryProfile[]> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => deliveryRowToProfile(row as WebhookDeliveryRow))
  }

  async recordDelivery(input: RecordDeliveryInput): Promise<WebhookDeliveryProfile> {
    const { data, error } = await this.supabase
      .from('webhook_deliveries')
      .insert({
        id: input.id,
        webhook_id: input.webhookId,
        event_type: input.eventType,
        payload: input.payload, // Store as string, will be JSONB in DB
        status_code: input.statusCode,
        response_body: input.responseBody,
        duration_ms: input.durationMs,
        success: input.success,
      })
      .select()
      .single()
      .throwOnError()

    if (error) {
      throw error
    }

    return deliveryRowToProfile(data as WebhookDeliveryRow)
  }

  async updateWebhookStatus(id: string, input: UpdateWebhookStatusInput): Promise<void> {
    const updates: Record<string, unknown> = {
      last_triggered_at: input.lastTriggeredAt,
      last_status_code: input.lastStatusCode,
    }

    if (input.failureCount !== undefined) {
      updates.failure_count = input.failureCount
    }
    if (input.active !== undefined) {
      updates.active = input.active
    }

    const { error } = await this.supabase
      .from('webhooks')
      .update(updates)
      .eq('id', id)
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async getActiveWebhooksForRecipient(recipientId: string): Promise<WebhookProfile[]> {
    const { data, error } = await this.supabase
      .from('webhooks')
      .select('*')
      .eq('claw_id', recipientId)
      .eq('type', 'outgoing')
      .eq('active', true)
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => rowToProfile(row as WebhookRow))
  }
}
