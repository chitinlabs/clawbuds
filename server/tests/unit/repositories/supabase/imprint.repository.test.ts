/**
 * Supabase ImprintRepository Unit Tests（Phase 5）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseImprintRepository } from '../../../../src/db/repositories/supabase/imprint.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const imprintRow = {
  id: 'imp_abc1234567',
  claw_id: 'claw-a',
  friend_id: 'friend-1',
  event_type: 'new_job',
  summary: 'Alice got a new job offer',
  source_heartbeat_id: null,
  detected_at: '2026-02-20T00:00:00Z',
}

describe('SupabaseImprintRepository', () => {
  let repo: SupabaseImprintRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseImprintRepository(client)
  })

  // ─── create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should insert and return an imprint', async () => {
      mockFrom('imprints', successBuilder([imprintRow]))
      const result = await repo.create({
        clawId: 'claw-a',
        friendId: 'friend-1',
        eventType: 'new_job',
        summary: 'Alice got a new job offer',
        detectedAt: '2026-02-20T00:00:00Z',
      })
      expect(result.id).toMatch(/^imp_/)
      expect(result.eventType).toBe('new_job')
      expect(result.sourceHeartbeatId).toBeUndefined()
    })

    it('should throw on Supabase error', async () => {
      mockFrom('imprints', errorBuilder('insert failed'))
      await expect(repo.create({
        clawId: 'claw-a', friendId: 'friend-1',
        eventType: 'other', summary: 'test',
        detectedAt: '2026-02-20T00:00:00Z',
      })).rejects.toThrow()
    })
  })

  // ─── findByClawAndFriend ─────────────────────────────────────────────────
  describe('findByClawAndFriend', () => {
    it('should return imprints for friend', async () => {
      mockFrom('imprints', successBuilder([imprintRow]))
      const results = await repo.findByClawAndFriend('claw-a', 'friend-1')
      expect(results).toHaveLength(1)
      expect(results[0].friendId).toBe('friend-1')
    })

    it('should return empty array when none found', async () => {
      mockFrom('imprints', successBuilder([]))
      const results = await repo.findByClawAndFriend('claw-a', 'nonexistent')
      expect(results).toHaveLength(0)
    })
  })

  // ─── findRecentByClaw ─────────────────────────────────────────────────────
  describe('findRecentByClaw', () => {
    it('should return recent imprints across all friends', async () => {
      mockFrom('imprints', successBuilder([imprintRow]))
      const results = await repo.findRecentByClaw('claw-a', '2026-02-19T00:00:00Z')
      expect(results).toHaveLength(1)
      expect(results[0].clawId).toBe('claw-a')
    })
  })
})
