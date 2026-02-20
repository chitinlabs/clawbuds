/**
 * Supabase TrustRepository Unit Tests (Phase 7)
 * TDD 红灯：实现前测试应失败
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseTrustRepository } from '../../../../src/db/repositories/supabase/trust.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const trustRow = {
  id: 'uuid-trust-001',
  from_claw_id: 'claw_aaa',
  to_claw_id: 'claw_bbb',
  domain: '_overall',
  q_score: 0.5,
  h_score: null,
  n_score: 0.5,
  w_score: 0.0,
  composite: 0.5,
  updated_at: '2026-02-20T00:00:00.000Z',
}

describe('SupabaseTrustRepository', () => {
  let repo: SupabaseTrustRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseTrustRepository(client)
  })

  describe('get', () => {
    it('should return null when no record exists', async () => {
      mockFrom('trust_scores', successBuilder(null))
      const result = await repo.get('claw_aaa', 'claw_bbb', '_overall')
      expect(result).toBeNull()
    })

    it('should return TrustScoreRecord when exists', async () => {
      mockFrom('trust_scores', successBuilder(trustRow))
      const result = await repo.get('claw_aaa', 'claw_bbb', '_overall')
      expect(result).not.toBeNull()
      expect(result!.fromClawId).toBe('claw_aaa')
      expect(result!.toClawId).toBe('claw_bbb')
      expect(result!.domain).toBe('_overall')
      expect(result!.hScore).toBeNull()
      expect(result!.composite).toBe(0.5)
    })

    it('should throw on Supabase error', async () => {
      mockFrom('trust_scores', errorBuilder('db error'))
      await expect(repo.get('claw_aaa', 'claw_bbb', '_overall')).rejects.toThrow()
    })
  })

  describe('getAllDomains', () => {
    it('should return all domain records for a pair', async () => {
      const rows = [
        { ...trustRow, id: 'uuid-001', domain: '_overall' },
        { ...trustRow, id: 'uuid-002', domain: 'AI', composite: 0.8 },
      ]
      mockFrom('trust_scores', successBuilder(rows))
      const result = await repo.getAllDomains('claw_aaa', 'claw_bbb')
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.domain)).toContain('AI')
    })

    it('should return empty array when no records', async () => {
      mockFrom('trust_scores', successBuilder([]))
      const result = await repo.getAllDomains('claw_aaa', 'claw_bbb')
      expect(result).toHaveLength(0)
    })
  })

  describe('getAllForClaw', () => {
    it('should return all trusts ordered by composite desc', async () => {
      const rows = [
        { ...trustRow, id: 'uuid-003', to_claw_id: 'claw_bbb', composite: 0.8 },
        { ...trustRow, id: 'uuid-004', to_claw_id: 'claw_ccc', composite: 0.6 },
      ]
      mockFrom('trust_scores', successBuilder(rows))
      const result = await repo.getAllForClaw('claw_aaa')
      expect(result).toHaveLength(2)
      expect(result[0].composite).toBeGreaterThanOrEqual(result[1].composite)
    })
  })

  describe('upsert', () => {
    it('should upsert and return TrustScoreRecord', async () => {
      const upsertedRow = { ...trustRow, q_score: 0.7, h_score: 0.9 }
      mockFrom('trust_scores', successBuilder([upsertedRow]))
      const result = await repo.upsert({
        fromClawId: 'claw_aaa',
        toClawId: 'claw_bbb',
        domain: '_overall',
        qScore: 0.7,
        hScore: 0.9,
      })
      expect(result.qScore).toBe(0.7)
      expect(result.hScore).toBe(0.9)
    })

    it('should throw on Supabase error', async () => {
      mockFrom('trust_scores', errorBuilder('upsert failed'))
      await expect(
        repo.upsert({ fromClawId: 'claw_aaa', toClawId: 'claw_bbb', domain: '_overall' }),
      ).rejects.toThrow()
    })
  })

  describe('updateQScore', () => {
    it('should call update with clamped delta', async () => {
      mockFrom('trust_scores', successBuilder(null))
      await expect(
        repo.updateQScore('claw_aaa', 'claw_bbb', '_overall', +0.05),
      ).resolves.not.toThrow()
    })
  })

  describe('updateHScore', () => {
    it('should allow setting h_score to null', async () => {
      mockFrom('trust_scores', successBuilder(null))
      await expect(
        repo.updateHScore('claw_aaa', 'claw_bbb', '_overall', null),
      ).resolves.not.toThrow()
    })
  })

  describe('initialize', () => {
    it('should insert _overall record with defaults', async () => {
      mockFrom('trust_scores', successBuilder([trustRow]))
      await expect(repo.initialize('claw_aaa', 'claw_bbb')).resolves.not.toThrow()
    })
  })

  describe('delete', () => {
    it('should delete all records for the pair', async () => {
      mockFrom('trust_scores', successBuilder(null))
      await expect(repo.delete('claw_aaa', 'claw_bbb')).resolves.not.toThrow()
    })
  })

  describe('decayAllQ', () => {
    it('should return affected row count', async () => {
      mockFrom('trust_scores', { data: null, error: null, count: 5 })
      const count = await repo.decayAllQ(0.99)
      expect(typeof count).toBe('number')
    })
  })

  describe('getTopDomains', () => {
    it('should return top domains ordered by composite', async () => {
      const rows = [
        { ...trustRow, domain: 'AI', composite: 0.85 },
        { ...trustRow, domain: 'design', composite: 0.7 },
      ]
      mockFrom('trust_scores', successBuilder(rows))
      const result = await repo.getTopDomains('claw_aaa', 'claw_bbb', 2)
      expect(result).toHaveLength(2)
      expect(result[0].composite).toBeGreaterThanOrEqual(result[1].composite)
    })
  })
})
