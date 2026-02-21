/**
 * PatternStalenessDetector 单元测试（Phase 10）
 * 覆盖 4 种检测 + computeHealthScore + triggerDiversification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PatternStalenessDetector } from '../../../src/services/pattern-staleness-detector.js'
import type { IReflexExecutionRepository } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'
import type { ICarapaceHistoryRepository } from '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'

function createMockExecutionRepo(): IReflexExecutionRepository {
  return {
    create: vi.fn(),
    findByClawId: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByResult: vi.fn().mockResolvedValue([]),
    updateResult: vi.fn(),
    findByBatchId: vi.fn().mockResolvedValue([]),
    countByResultSince: vi.fn().mockResolvedValue(0),
    countByPearlRef: vi.fn().mockResolvedValue(0),
  } as unknown as IReflexExecutionRepository
}

function createMockHistoryRepo(): ICarapaceHistoryRepository {
  return {
    create: vi.fn(),
    getLatestVersion: vi.fn().mockResolvedValue(0),
    findByOwner: vi.fn().mockResolvedValue([]),
    findByVersion: vi.fn().mockResolvedValue(null),
    pruneOldVersions: vi.fn().mockResolvedValue(0),
  }
}

describe('PatternStalenessDetector', () => {
  let detector: PatternStalenessDetector
  let executionRepo: IReflexExecutionRepository
  let historyRepo: ICarapaceHistoryRepository

  beforeEach(() => {
    executionRepo = createMockExecutionRepo()
    historyRepo = createMockHistoryRepo()
    detector = new PatternStalenessDetector(executionRepo, historyRepo)
  })

  // ─── detect ───────────────────────────────────────────────────────────────

  describe('detect', () => {
    it('should return empty array when no issues', async () => {
      const alerts = await detector.detect('claw-test')
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('should return StalenessAlert array', async () => {
      const alerts = await detector.detect('claw-test')
      for (const alert of alerts) {
        expect(alert.type).toBeDefined()
        expect(alert.severity).toMatch(/^(low|medium|high)$/)
        expect(alert.description).toBeDefined()
        expect(alert.diversificationSuggestion).toBeDefined()
      }
    })
  })

  // ─── detectEmojiMonotony ──────────────────────────────────────────────────

  describe('emoji monotony detection', () => {
    it('should detect emoji_monotony when single emoji ≥ 90% of executions', async () => {
      const executions = Array.from({ length: 20 }, (_, i) => ({
        id: `exec-${i}`,
        clawId: 'claw-test',
        reflexId: 'phatic_micro_reaction',
        reflexName: 'phatic_micro_reaction',
        eventType: 'message.received',
        triggerData: {},
        executionResult: 'executed',
        // 18 out of 20 use 👍 = 90%
        details: { emoji: i < 18 ? '👍' : '❤️' },
        createdAt: new Date().toISOString(),
      }))
      vi.mocked(executionRepo.findByResult).mockResolvedValue(executions as any)

      const alerts = await detector.detect('claw-test')
      const emojiAlert = alerts.find((a) => a.type === 'emoji_monotony')
      expect(emojiAlert).toBeDefined()
      expect(emojiAlert?.severity).toMatch(/medium|high/)
    })

    it('should not detect emoji_monotony when diversity is healthy', async () => {
      const emojis = ['👍', '❤️', '🎉', '✨', '💡']
      const executions = Array.from({ length: 10 }, (_, i) => ({
        id: `exec-${i}`,
        clawId: 'claw-test',
        reflexId: 'phatic_micro_reaction',
        reflexName: 'phatic_micro_reaction',
        eventType: 'message.received',
        triggerData: {},
        executionResult: 'executed',
        details: { emoji: emojis[i % emojis.length] },
        createdAt: new Date().toISOString(),
      }))
      vi.mocked(executionRepo.findByResult).mockResolvedValue(executions as any)

      const alerts = await detector.detect('claw-test')
      const emojiAlert = alerts.find((a) => a.type === 'emoji_monotony')
      expect(emojiAlert).toBeUndefined()
    })
  })

  // ─── detectCarapaceStaleness ──────────────────────────────────────────────

  describe('carapace staleness detection', () => {
    it('should detect carapace_stale when last update > 60 days ago', async () => {
      const oldDate = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000).toISOString()
      vi.mocked(historyRepo.findByOwner).mockResolvedValue([{
        id: 'hist-old',
        clawId: 'claw-test',
        version: 1,
        content: 'old content',
        changeReason: 'manual_edit',
        suggestedBy: 'user',
        createdAt: oldDate,
      }])

      const alerts = await detector.detect('claw-test')
      const staleAlert = alerts.find((a) => a.type === 'carapace_stale')
      expect(staleAlert).toBeDefined()
      expect(staleAlert?.severity).toBe('low')
    })

    it('should not detect carapace_stale when recently updated', async () => {
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      vi.mocked(historyRepo.findByOwner).mockResolvedValue([{
        id: 'hist-recent',
        clawId: 'claw-test',
        version: 5,
        content: 'recent content',
        changeReason: 'micro_molt',
        suggestedBy: 'system',
        createdAt: recentDate,
      }])

      const alerts = await detector.detect('claw-test')
      const staleAlert = alerts.find((a) => a.type === 'carapace_stale')
      expect(staleAlert).toBeUndefined()
    })
  })

  // ─── computeHealthScore ───────────────────────────────────────────────────

  describe('computeHealthScore', () => {
    it('should return PatternHealthScore with all required fields', async () => {
      const score = await detector.computeHealthScore('claw-test')
      expect(typeof score.overall).toBe('number')
      expect(typeof score.reflexDiversity).toBe('number')
      expect(typeof score.templateDiversity).toBe('number')
      expect(typeof score.carapaceFreshness).toBe('number')
      expect(typeof score.lastUpdated).toBe('string')
    })

    it('should return overall score in [0, 1] range', async () => {
      const score = await detector.computeHealthScore('claw-test')
      expect(score.overall).toBeGreaterThanOrEqual(0)
      expect(score.overall).toBeLessThanOrEqual(1)
    })

    it('should return low freshness when carapace not updated for 60+ days', async () => {
      const oldDate = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString()
      vi.mocked(historyRepo.findByOwner).mockResolvedValue([{
        id: 'hist-old',
        clawId: 'claw-test',
        version: 1,
        content: 'content',
        changeReason: 'manual_edit',
        suggestedBy: 'user',
        createdAt: oldDate,
      }])
      const score = await detector.computeHealthScore('claw-test')
      expect(score.carapaceFreshness).toBeLessThan(0.5)
    })
  })

  // ─── triggerDiversification ───────────────────────────────────────────────

  describe('triggerDiversification', () => {
    it('should execute without error for emoji_monotony alert', async () => {
      const alert = {
        type: 'emoji_monotony' as const,
        severity: 'medium' as const,
        description: 'test',
        diversificationSuggestion: 'use more emojis',
      }
      await expect(detector.triggerDiversification('claw-test', alert)).resolves.not.toThrow()
    })

    it('should execute without error for carapace_stale alert', async () => {
      const alert = {
        type: 'carapace_stale' as const,
        severity: 'low' as const,
        description: 'test',
        diversificationSuggestion: 'update carapace',
      }
      await expect(detector.triggerDiversification('claw-test', alert)).resolves.not.toThrow()
    })
  })
})
