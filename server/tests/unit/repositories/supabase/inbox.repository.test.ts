import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseInboxRepository } from '../../../../src/db/repositories/supabase/inbox.repository.js'
import { createQueryBuilder } from './mock-supabase-client.js'

function createMockClient() {
  return { from: vi.fn() }
}

function makeInboxRow(overrides: Record<string, any> = {}) {
  return {
    id: 'ie_001',
    seq: 1,
    status: 'unread',
    created_at: '2025-01-01T00:00:00Z',
    messages: {
      id: 'msg_001',
      from_claw_id: 'alice',
      blocks_json: JSON.stringify([{ type: 'text', text: 'Hello!' }]),
      visibility: 'direct',
      content_warning: null,
      created_at: '2025-01-01T00:00:00Z',
      claws: { display_name: 'Alice' },
    },
    ...overrides,
  }
}

describe('SupabaseInboxRepository', () => {
  let client: ReturnType<typeof createMockClient>
  let repo: SupabaseInboxRepository

  beforeEach(() => {
    client = createMockClient()
    repo = new SupabaseInboxRepository(client as any)
  })

  describe('getInbox', () => {
    it('should return inbox entries with parsed blocks', async () => {
      const rows = [makeInboxRow()]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getInbox('bob')

      expect(client.from).toHaveBeenCalledWith('inbox_entries')
      expect(builder.eq).toHaveBeenCalledWith('recipient_id', 'bob')
      expect(builder.gt).toHaveBeenCalledWith('seq', 0) // default afterSeq
      expect(builder.throwOnError).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('ie_001')
      expect(result[0].seq).toBe(1)
      expect(result[0].message.fromClawId).toBe('alice')
      expect(result[0].message.fromDisplayName).toBe('Alice')
      expect(result[0].message.blocks).toEqual([{ type: 'text', text: 'Hello!' }])
    })

    it('should filter by status (unread by default)', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      await repo.getInbox('bob')

      expect(builder.eq).toHaveBeenCalledWith('status', 'unread')
    })

    it('should not filter by status when status is "all"', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      await repo.getInbox('bob', { status: 'all' })

      // 'status' eq should only be called for recipient_id
      const eqCalls = builder.eq.mock.calls
      const statusCalls = eqCalls.filter((call: any[]) => call[0] === 'status')
      expect(statusCalls).toHaveLength(0)
    })

    it('should respect afterSeq parameter', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      await repo.getInbox('bob', { afterSeq: 100 })

      expect(builder.gt).toHaveBeenCalledWith('seq', 100)
    })

    it('should cap limit at 100', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      await repo.getInbox('bob', { limit: 500 })

      expect(builder.limit).toHaveBeenCalledWith(100)
    })

    it('should handle already-parsed blocks_json', async () => {
      const row = makeInboxRow({
        messages: {
          id: 'msg_002',
          from_claw_id: 'alice',
          blocks_json: [{ type: 'text', text: 'Already parsed' }],
          visibility: 'direct',
          content_warning: null,
          created_at: '2025-01-01T00:00:00Z',
          claws: { display_name: 'Alice' },
        },
      })
      const builder = createQueryBuilder({ data: [row], error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getInbox('bob')

      expect(result[0].message.blocks).toEqual([{ type: 'text', text: 'Already parsed' }])
    })
  })

  describe('ack', () => {
    it('should update entries to acked status', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 3 })
      client.from.mockReturnValue(builder)

      const result = await repo.ack('bob', ['ie_001', 'ie_002', 'ie_003'])

      expect(builder.update).toHaveBeenCalled()
      const updateArg = builder.update.mock.calls[0][0]
      expect(updateArg.status).toBe('acked')
      expect(updateArg.acked_at).toBeDefined()
      expect(builder.eq).toHaveBeenCalledWith('recipient_id', 'bob')
      expect(builder.in).toHaveBeenCalledWith('id', ['ie_001', 'ie_002', 'ie_003'])
      expect(builder.neq).toHaveBeenCalledWith('status', 'acked')
      expect(result).toBe(3)
    })

    it('should return 0 for empty array', async () => {
      const result = await repo.ack('bob', [])

      expect(client.from).not.toHaveBeenCalled()
      expect(result).toBe(0)
    })
  })

  describe('getUnreadCount', () => {
    it('should count unread entries', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 7 })
      client.from.mockReturnValue(builder)

      const result = await repo.getUnreadCount('bob')

      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
      expect(builder.eq).toHaveBeenCalledWith('recipient_id', 'bob')
      expect(builder.eq).toHaveBeenCalledWith('status', 'unread')
      expect(result).toBe(7)
    })

    it('should return 0 when no unread', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 0 })
      client.from.mockReturnValue(builder)

      const result = await repo.getUnreadCount('bob')

      expect(result).toBe(0)
    })
  })
})
