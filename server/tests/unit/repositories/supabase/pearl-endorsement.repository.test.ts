/**
 * Supabase PearlEndorsementRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabasePearlEndorsementRepository } from '../../../../src/db/repositories/supabase/pearl-endorsement.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const endorsementRow = {
  id: 'uuid-end-1',
  pearl_id: 'uuid-pearl-1',
  endorser_claw_id: 'uuid-endorser-1',
  score: 0.8,
  comment: 'great insight',
  created_at: '2026-02-19T00:00:00.000Z',
  updated_at: '2026-02-19T00:00:00.000Z',
}

describe('SupabasePearlEndorsementRepository', () => {
  let repo: SupabasePearlEndorsementRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabasePearlEndorsementRepository(client)
  })

  // ─── upsert ─────────────────────────────────────────────────────────────
  describe('upsert', () => {
    it('should create/update endorsement and return record', async () => {
      mockFrom('pearl_endorsements', successBuilder(endorsementRow))

      const result = await repo.upsert({
        id: 'uuid-end-1',
        pearlId: 'uuid-pearl-1',
        endorserClawId: 'uuid-endorser-1',
        score: 0.8,
        comment: 'great insight',
      })

      expect(result.id).toBe('uuid-end-1')
      expect(result.pearlId).toBe('uuid-pearl-1')
      expect(result.endorserClawId).toBe('uuid-endorser-1')
      expect(result.score).toBe(0.8)
      expect(result.comment).toBe('great insight')
    })

    it('should throw on database error', async () => {
      mockFrom('pearl_endorsements', errorBuilder('upsert failed'))
      await expect(
        repo.upsert({ id: 'uuid-end-1', pearlId: 'uuid-pearl-1', endorserClawId: 'uuid-e', score: 0.5 }),
      ).rejects.toThrow()
    })
  })

  // ─── findByPearl ─────────────────────────────────────────────────────────
  describe('findByPearl', () => {
    it('should return empty array when none found', async () => {
      mockFrom('pearl_endorsements', successBuilder([]))
      const result = await repo.findByPearl('uuid-pearl-1')
      expect(result).toEqual([])
    })

    it('should map rows to PearlEndorsementRecord', async () => {
      mockFrom('pearl_endorsements', successBuilder([endorsementRow]))
      const result = await repo.findByPearl('uuid-pearl-1')
      expect(result).toHaveLength(1)
      expect(result[0].pearlId).toBe('uuid-pearl-1')
      expect(result[0].score).toBe(0.8)
    })
  })

  // ─── findOne ─────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return null when not found (PGRST116)', async () => {
      mockFrom('pearl_endorsements', notFoundBuilder())
      const result = await repo.findOne('uuid-pearl-1', 'uuid-endorser-1')
      expect(result).toBeNull()
    })

    it('should return endorsement when found', async () => {
      mockFrom('pearl_endorsements', successBuilder(endorsementRow))
      const result = await repo.findOne('uuid-pearl-1', 'uuid-endorser-1')
      expect(result).not.toBeNull()
      expect(result!.score).toBe(0.8)
    })
  })

  // ─── getScores ───────────────────────────────────────────────────────────
  describe('getScores', () => {
    it('should return empty array when none', async () => {
      mockFrom('pearl_endorsements', successBuilder([]))
      const scores = await repo.getScores('uuid-pearl-1')
      expect(scores).toEqual([])
    })

    it('should return score values', async () => {
      mockFrom('pearl_endorsements', successBuilder([{ score: 0.8 }, { score: 0.6 }]))
      const scores = await repo.getScores('uuid-pearl-1')
      expect(scores).toContain(0.8)
      expect(scores).toContain(0.6)
    })
  })
})
