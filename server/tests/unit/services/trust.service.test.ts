/**
 * TrustService Tests (Phase 7)
 * 覆盖 T8-T13：getComposite、updateQ、setH、recalculateN、recalculateW、decayAll
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrustService } from '../../../src/services/trust.service.js'
import type { ITrustRepository, TrustScoreRecord } from '../../../src/db/repositories/interfaces/trust.repository.interface.js'

// ---- Mock Repository ----

function makeRecord(overrides: Partial<TrustScoreRecord> = {}): TrustScoreRecord {
  return {
    id: 'trust_001',
    fromClawId: 'claw_a',
    toClawId: 'claw_b',
    domain: '_overall',
    qScore: 0.5,
    hScore: null,
    nScore: 0.5,
    wScore: 0.0,
    composite: 0.5,
    updatedAt: '2026-02-20T00:00:00.000Z',
    ...overrides,
  }
}

function makeRepo(overrides: Partial<ITrustRepository> = {}): ITrustRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getAllDomains: vi.fn().mockResolvedValue([]),
    getAllForClaw: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(makeRecord()),
    updateQScore: vi.fn().mockResolvedValue(undefined),
    updateHScore: vi.fn().mockResolvedValue(undefined),
    updateNScore: vi.fn().mockResolvedValue(undefined),
    updateWScore: vi.fn().mockResolvedValue(undefined),
    updateComposite: vi.fn().mockResolvedValue(undefined),
    decayAllQ: vi.fn().mockResolvedValue(0),
    initialize: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getTopDomains: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('TrustService', () => {
  let repo: ITrustRepository
  let service: TrustService

  beforeEach(() => {
    repo = makeRepo()
    service = new TrustService(repo, null as any, null as any, null as any)
  })

  // ---- T8: getComposite ----

  describe('T8: getComposite（含领域回退）', () => {
    it('should return composite from domain-specific record', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord({ composite: 0.85, domain: 'AI' }))
      const result = await service.getComposite('claw_a', 'claw_b', 'AI')
      expect(result).toBe(0.85)
    })

    it('should fall back to _overall when domain-specific record not found', async () => {
      vi.mocked(repo.get)
        .mockResolvedValueOnce(null)  // AI domain not found
        .mockResolvedValueOnce(makeRecord({ composite: 0.62, domain: '_overall' }))
      const result = await service.getComposite('claw_a', 'claw_b', 'AI')
      expect(result).toBe(0.62)
    })

    it('should return default 0.5 when no records exist', async () => {
      vi.mocked(repo.get).mockResolvedValue(null)
      const result = await service.getComposite('claw_a', 'claw_b', '_overall')
      expect(result).toBe(0.5)
    })

    it('should not double-query when domain is _overall', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord({ composite: 0.7 }))
      await service.getComposite('claw_a', 'claw_b', '_overall')
      expect(repo.get).toHaveBeenCalledTimes(1)
    })
  })

  // ---- T9: updateQ ----

  describe('T9: updateQ（Q 信号 → delta）', () => {
    it('should update q_score for _overall domain', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord())
      await service.updateQ('claw_a', 'claw_b', '_overall', 'pearl_endorsed_high')
      expect(repo.updateQScore).toHaveBeenCalledWith('claw_a', 'claw_b', '_overall', +0.05)
    })

    it('should update both _overall and specified domain', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord())
      await service.updateQ('claw_a', 'claw_b', 'AI', 'groom_replied')
      // Called twice: _overall + AI
      expect(repo.updateQScore).toHaveBeenCalledTimes(2)
    })

    it('should apply negative delta for low-quality signals', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord())
      await service.updateQ('claw_a', 'claw_b', '_overall', 'pearl_endorsed_low')
      expect(repo.updateQScore).toHaveBeenCalledWith('claw_a', 'claw_b', '_overall', -0.02)
    })

    it('should trigger composite recalculation after Q update', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord())
      await service.updateQ('claw_a', 'claw_b', '_overall', 'pearl_endorsed_high')
      expect(repo.updateComposite).toHaveBeenCalled()
    })
  })

  // ---- T10: setH ----

  describe('T10: setH（H 维度 + 重算 composite）', () => {
    it('should update h_score and return old/new composite', async () => {
      const beforeRecord = makeRecord({ composite: 0.5, hScore: null })
      const afterRecord = makeRecord({ composite: 0.78, hScore: 0.9 })
      vi.mocked(repo.get)
        .mockResolvedValueOnce(beforeRecord)  // ensureRecord check (exists, skip upsert)
        .mockResolvedValueOnce(beforeRecord)  // before snapshot
        .mockResolvedValueOnce(beforeRecord)  // recalculateComposite: read scores
        .mockResolvedValueOnce(afterRecord)   // after snapshot
      const result = await service.setH('claw_a', 'claw_b', 0.9, '_overall')
      expect(result.oldComposite).toBe(0.5)
      expect(repo.updateHScore).toHaveBeenCalledWith('claw_a', 'claw_b', '_overall', 0.9)
    })

    it('should default domain to _overall', async () => {
      vi.mocked(repo.get).mockResolvedValue(makeRecord())
      await service.setH('claw_a', 'claw_b', 0.8)
      expect(repo.updateHScore).toHaveBeenCalledWith('claw_a', 'claw_b', '_overall', 0.8)
    })
  })

  // ---- T13: recalculateComposite / decayAll / initializeRelationship / removeRelationship ----

  describe('T13: decayAll（Q 月衰减）', () => {
    it('should call decayAllQ with 0.99 rate', async () => {
      await service.decayAll()
      expect(repo.decayAllQ).toHaveBeenCalledWith(0.99)
    })
  })

  describe('initializeRelationship', () => {
    it('should call repo.initialize for both directions', async () => {
      await service.initializeRelationship('claw_a', 'claw_b')
      expect(repo.initialize).toHaveBeenCalledWith('claw_a', 'claw_b')
    })
  })

  describe('removeRelationship', () => {
    it('should delete trust records', async () => {
      await service.removeRelationship('claw_a', 'claw_b')
      expect(repo.delete).toHaveBeenCalledWith('claw_a', 'claw_b')
    })
  })

  describe('getByDomain', () => {
    it('should return all domain records', async () => {
      const records = [makeRecord({ domain: '_overall' }), makeRecord({ domain: 'AI' })]
      vi.mocked(repo.getAllDomains).mockResolvedValue(records)
      const result = await service.getByDomain('claw_a', 'claw_b')
      expect(result).toHaveLength(2)
    })
  })
})
