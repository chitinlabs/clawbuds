import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseStatsRepository } from '../../../../src/db/repositories/supabase/stats.repository.js'
import { createQueryBuilder } from './mock-supabase-client.js'

function createMockClient() {
  return { from: vi.fn() }
}

describe('SupabaseStatsRepository', () => {
  let client: ReturnType<typeof createMockClient>
  let repo: SupabaseStatsRepository

  beforeEach(() => {
    client = createMockClient()
    repo = new SupabaseStatsRepository(client as any)
  })

  describe('getStats', () => {
    it('should aggregate stats from multiple tables', async () => {
      // getStats calls from() 4 times:
      //   1. messages (sent count)
      //   2. inbox_entries (received count)
      //   3. friendships (friends count)
      //   4. messages (last message)
      const sentBuilder = createQueryBuilder({ data: null, error: null, count: 10 })
      const receivedBuilder = createQueryBuilder({ data: null, error: null, count: 25 })
      const friendsBuilder = createQueryBuilder({ data: null, error: null, count: 5 })
      const lastMsgBuilder = createQueryBuilder({
        data: { created_at: '2025-06-01T12:00:00Z' },
        error: null,
      })

      client.from
        .mockReturnValueOnce(sentBuilder)       // messages (sent)
        .mockReturnValueOnce(receivedBuilder)    // inbox_entries (received)
        .mockReturnValueOnce(friendsBuilder)     // friendships
        .mockReturnValueOnce(lastMsgBuilder)     // messages (last)

      const result = await repo.getStats('claw_abc')

      expect(result.messagesSent).toBe(10)
      expect(result.messagesReceived).toBe(25)
      expect(result.friendsCount).toBe(5)
      expect(result.lastMessageAt).toBe('2025-06-01T12:00:00Z')
    })

    it('should handle zero stats', async () => {
      const zeroBuilder = createQueryBuilder({ data: null, error: null, count: 0 })
      const nullMsgBuilder = createQueryBuilder({ data: null, error: null })

      client.from
        .mockReturnValueOnce(zeroBuilder)
        .mockReturnValueOnce(zeroBuilder)
        .mockReturnValueOnce(zeroBuilder)
        .mockReturnValueOnce(nullMsgBuilder)

      const result = await repo.getStats('new_user')

      expect(result.messagesSent).toBe(0)
      expect(result.messagesReceived).toBe(0)
      expect(result.friendsCount).toBe(0)
      expect(result.lastMessageAt).toBeUndefined()
    })

    it('should query the right tables', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 0 })
      client.from.mockReturnValue(builder)

      await repo.getStats('claw_abc')

      const tables = client.from.mock.calls.map((call: any[]) => call[0])
      expect(tables).toEqual(['messages', 'inbox_entries', 'friendships', 'messages'])
    })
  })

  describe('initStats', () => {
    it('should upsert into claw_stats', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.initStats('claw_abc')

      expect(client.from).toHaveBeenCalledWith('claw_stats')
      expect(builder.upsert).toHaveBeenCalledWith(
        { claw_id: 'claw_abc' },
        { onConflict: 'claw_id', ignoreDuplicates: true },
      )
      expect(builder.throwOnError).toHaveBeenCalled()
    })
  })
})
