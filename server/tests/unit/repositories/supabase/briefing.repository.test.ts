/**
 * Supabase BriefingRepository Unit Tests（Phase 6）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseBriefingRepository } from '../../../../src/db/repositories/supabase/briefing.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const briefingRow = {
  id: 'brief_abc123',
  claw_id: 'claw-a',
  type: 'daily',
  content: '# Today Briefing',
  raw_data: { messages: [] },
  generated_at: '2026-02-20T20:00:00Z',
  acknowledged_at: null,
}

describe('SupabaseBriefingRepository', () => {
  let repo: SupabaseBriefingRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseBriefingRepository(client)
  })

  describe('create', () => {
    it('should insert and return a briefing', async () => {
      mockFrom('briefings', successBuilder([briefingRow]))
      const result = await repo.create({
        id: 'brief_abc123',
        clawId: 'claw-a',
        type: 'daily',
        content: '# Today Briefing',
        rawData: { messages: [] },
      })
      expect(result.id).toBe('brief_abc123')
      expect(result.type).toBe('daily')
      expect(result.acknowledgedAt).toBeNull()
    })

    it('should throw on Supabase error', async () => {
      mockFrom('briefings', errorBuilder('insert failed'))
      await expect(repo.create({
        id: 'brief_err', clawId: 'claw-a', type: 'daily',
        content: '# Error', rawData: {},
      })).rejects.toThrow()
    })
  })

  describe('findLatest', () => {
    it('should return the latest briefing', async () => {
      mockFrom('briefings', successBuilder([briefingRow]))
      const result = await repo.findLatest('claw-a')
      expect(result?.id).toBe('brief_abc123')
    })

    it('should return null when no briefings', async () => {
      mockFrom('briefings', successBuilder([]))
      const result = await repo.findLatest('claw-a')
      expect(result).toBeNull()
    })
  })

  describe('findHistory', () => {
    it('should return briefings list', async () => {
      mockFrom('briefings', successBuilder([briefingRow]))
      const results = await repo.findHistory('claw-a')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('acknowledge', () => {
    it('should not throw when acknowledging', async () => {
      mockFrom('briefings', successBuilder([]))
      await expect(repo.acknowledge('brief_abc123', '2026-02-20T21:00:00Z')).resolves.not.toThrow()
    })
  })

  describe('getUnreadCount', () => {
    it('should return count from Supabase', async () => {
      mockFrom('briefings', { data: [{}], error: null, count: 3 })
      const count = await repo.getUnreadCount('claw-a')
      expect(typeof count).toBe('number')
    })
  })
})
