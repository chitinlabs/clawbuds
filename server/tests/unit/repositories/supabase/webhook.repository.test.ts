import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseWebhookRepository } from '../../../../src/db/repositories/supabase/webhook.repository.js'
import { WebhookError } from '../../../../src/db/repositories/interfaces/webhook.repository.interface.js'
import { createQueryBuilder } from './mock-supabase-client.js'

function createMockClient() {
  return { from: vi.fn() }
}

function makeWebhookRow(overrides: Record<string, any> = {}) {
  return {
    id: 'wh_001',
    claw_id: 'claw_abc',
    type: 'outgoing',
    name: 'My Webhook',
    url: 'https://example.com/webhook',
    secret: 'secret_abc',
    events: ['message.new'],
    active: true,
    failure_count: 0,
    last_triggered_at: null,
    last_status_code: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeDeliveryRow(overrides: Record<string, any> = {}) {
  return {
    id: 'del_001',
    webhook_id: 'wh_001',
    event_type: 'message.new',
    payload: '{"test": true}',
    status_code: 200,
    response_body: 'OK',
    duration_ms: 150,
    success: true,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('SupabaseWebhookRepository', () => {
  let client: ReturnType<typeof createMockClient>
  let repo: SupabaseWebhookRepository

  beforeEach(() => {
    client = createMockClient()
    repo = new SupabaseWebhookRepository(client as any)
  })

  describe('create', () => {
    it('should insert and return webhook profile', async () => {
      const row = makeWebhookRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.create({
        id: 'wh_001',
        clawId: 'claw_abc',
        type: 'outgoing',
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        secret: 'secret_abc',
        events: ['message.new'],
      })

      expect(client.from).toHaveBeenCalledWith('webhooks')
      expect(result.id).toBe('wh_001')
      expect(result.clawId).toBe('claw_abc')
      expect(result.name).toBe('My Webhook')
      expect(result.events).toEqual(['message.new'])
    })

    it('should throw WebhookError on unique violation (23505)', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: '23505', message: 'unique violation' },
      })
      client.from.mockReturnValue(builder)

      await expect(repo.create({
        id: 'wh_dup',
        clawId: 'claw_abc',
        type: 'outgoing',
        name: 'Duplicate',
        url: 'https://example.com',
        secret: 'secret',
        events: [],
      })).rejects.toThrow(WebhookError)
    })
  })

  describe('findById', () => {
    it('should return webhook when found', async () => {
      const row = makeWebhookRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('wh_001')

      expect(builder.eq).toHaveBeenCalledWith('id', 'wh_001')
      expect(builder.maybeSingle).toHaveBeenCalled()
      // throwOnError is called on the thenable returned by maybeSingle
      expect(result).not.toBeNull()
      expect(result!.id).toBe('wh_001')
    })

    it('should return null when not found', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('listByClawId', () => {
    it('should return webhooks ordered by created_at', async () => {
      const rows = [makeWebhookRow({ id: 'wh_002' }), makeWebhookRow({ id: 'wh_001' })]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.listByClawId('claw_abc')

      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc')
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('should update and return updated webhook', async () => {
      const updatedRow = makeWebhookRow({ url: 'https://new.example.com' })
      const builder = createQueryBuilder({ data: updatedRow, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.update('wh_001', { url: 'https://new.example.com' })

      expect(builder.update).toHaveBeenCalledWith({ url: 'https://new.example.com' })
      expect(builder.eq).toHaveBeenCalledWith('id', 'wh_001')
      expect(result.url).toBe('https://new.example.com')
    })

    it('should reset failure_count when reactivating', async () => {
      const row = makeWebhookRow({ active: true, failure_count: 0 })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      await repo.update('wh_001', { active: true })

      const updateCall = builder.update.mock.calls[0][0]
      expect(updateCall.active).toBe(true)
      expect(updateCall.failure_count).toBe(0)
    })
  })

  describe('delete', () => {
    it('should delete the webhook', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.delete('wh_001')

      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'wh_001')
      expect(builder.throwOnError).toHaveBeenCalled()
    })
  })

  describe('getDeliveries', () => {
    it('should return delivery profiles', async () => {
      const rows = [makeDeliveryRow()]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getDeliveries('wh_001', 10)

      expect(client.from).toHaveBeenCalledWith('webhook_deliveries')
      expect(builder.eq).toHaveBeenCalledWith('webhook_id', 'wh_001')
      expect(builder.limit).toHaveBeenCalledWith(10)
      expect(result).toHaveLength(1)
      expect(result[0].webhookId).toBe('wh_001')
      expect(result[0].success).toBe(true)
    })
  })

  describe('recordDelivery', () => {
    it('should insert delivery record', async () => {
      const row = makeDeliveryRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.recordDelivery({
        id: 'del_001',
        webhookId: 'wh_001',
        eventType: 'message.new',
        payload: '{"test": true}',
        statusCode: 200,
        responseBody: 'OK',
        durationMs: 150,
        success: true,
      })

      expect(client.from).toHaveBeenCalledWith('webhook_deliveries')
      expect(result.id).toBe('del_001')
      expect(result.statusCode).toBe(200)
    })
  })

  describe('updateWebhookStatus', () => {
    it('should update webhook status fields', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.updateWebhookStatus('wh_001', {
        lastTriggeredAt: '2025-06-01T12:00:00Z',
        lastStatusCode: 200,
        failureCount: 0,
      })

      expect(builder.update).toHaveBeenCalled()
      const updateCall = builder.update.mock.calls[0][0]
      expect(updateCall.last_triggered_at).toBe('2025-06-01T12:00:00Z')
      expect(updateCall.last_status_code).toBe(200)
      expect(updateCall.failure_count).toBe(0)
    })
  })

  describe('getActiveWebhooksForRecipient', () => {
    it('should filter by active outgoing webhooks', async () => {
      const rows = [makeWebhookRow()]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getActiveWebhooksForRecipient('claw_abc')

      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc')
      expect(builder.eq).toHaveBeenCalledWith('type', 'outgoing')
      expect(builder.eq).toHaveBeenCalledWith('active', true)
      expect(result).toHaveLength(1)
    })
  })

  describe('row mapping', () => {
    it('should parse JSON events string', async () => {
      const row = makeWebhookRow({ events: '["message.new","friend.request"]' })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('wh_001')

      expect(result!.events).toEqual(['message.new', 'friend.request'])
    })

    it('should handle array events directly', async () => {
      const row = makeWebhookRow({ events: ['message.new'] })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('wh_001')

      expect(result!.events).toEqual(['message.new'])
    })

    it('should parse delivery payload string', async () => {
      const row = makeDeliveryRow({ payload: '{"event":"test"}' })
      const builder = createQueryBuilder({ data: [row], error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getDeliveries('wh_001', 10)

      expect(result[0].payload).toEqual({ event: 'test' })
    })
  })
})
