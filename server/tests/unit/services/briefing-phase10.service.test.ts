/**
 * BriefingService Phase 10 扩展测试
 * 测试 collectWeeklyData + stalenessAlerts + patternHealth + carapaceHistory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BriefingService } from '../../../src/services/briefing.service.js'
import { MicroMoltService } from '../../../src/services/micro-molt.service.js'
import type { IBriefingRepository } from '../../../src/db/repositories/interfaces/briefing.repository.interface.js'
import type { ICarapaceHistoryRepository } from '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
import type { PatternStalenessDetector } from '../../../src/services/pattern-staleness-detector.js'

function createMockBriefingRepo(): IBriefingRepository {
  return {
    create: vi.fn().mockImplementation(async (data) => ({ ...data, acknowledgedAt: null })),
    findLatest: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
    acknowledge: vi.fn(),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  }
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

function createMockStalenessDetector(): PatternStalenessDetector {
  return {
    detect: vi.fn().mockResolvedValue([]),
    computeHealthScore: vi.fn().mockResolvedValue({
      overall: 0.85,
      reflexDiversity: 0.9,
      templateDiversity: 0.8,
      carapaceFreshness: 0.85,
      lastUpdated: new Date().toISOString(),
    }),
    triggerDiversification: vi.fn().mockResolvedValue(undefined),
  } as unknown as PatternStalenessDetector
}

function createMockHostNotifier() {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
  }
}

describe('BriefingService Phase 10 - Weekly Data', () => {
  let service: BriefingService
  let briefingRepo: IBriefingRepository
  let historyRepo: ICarapaceHistoryRepository
  let staleness: PatternStalenessDetector

  beforeEach(() => {
    briefingRepo = createMockBriefingRepo()
    historyRepo = createMockHistoryRepo()
    staleness = createMockStalenessDetector()

    const microMoltService = new MicroMoltService(
      {
        create: vi.fn(),
        findByClawId: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
        findByResult: vi.fn().mockResolvedValue([]),
        updateResult: vi.fn(),
        findByBatchId: vi.fn().mockResolvedValue([]),
        countByResultSince: vi.fn().mockResolvedValue(0),
        countByPearlRef: vi.fn().mockResolvedValue(0),
      } as any,
      briefingRepo,
    )

    service = new BriefingService(briefingRepo, createMockHostNotifier() as any, microMoltService)
  })

  describe('injectPhase10Services', () => {
    it('should inject pattern services without error', () => {
      expect(() => {
        service.injectPhase10Services(staleness, historyRepo)
      }).not.toThrow()
    })
  })

  describe('collectWeeklyData', () => {
    it('should return BriefingRawData with patternHealth when phase10 services injected', async () => {
      service.injectPhase10Services(staleness, historyRepo)
      const data = await service.collectWeeklyData('claw-test')
      expect(data.patternHealth).toBeDefined()
      expect(typeof data.patternHealth!.overall).toBe('number')
    })

    it('should return BriefingRawData with carapaceHistory', async () => {
      const historyRecords = [{
        id: 'hist-1',
        clawId: 'claw-test',
        version: 1,
        content: 'content',
        changeReason: 'manual_edit' as const,
        suggestedBy: 'user' as const,
        createdAt: new Date().toISOString(),
      }]
      vi.mocked(historyRepo.findByOwner).mockResolvedValue(historyRecords)
      service.injectPhase10Services(staleness, historyRepo)
      const data = await service.collectWeeklyData('claw-test')
      expect(Array.isArray(data.carapaceHistory)).toBe(true)
    })

    it('should return BriefingRawData with stalenessAlerts', async () => {
      const alerts = [{
        type: 'emoji_monotony' as const,
        severity: 'medium' as const,
        description: 'test',
        diversificationSuggestion: 'suggestion',
      }]
      vi.mocked(staleness.detect).mockResolvedValue(alerts)
      service.injectPhase10Services(staleness, historyRepo)
      const data = await service.collectWeeklyData('claw-test')
      expect(Array.isArray(data.stalenessAlerts)).toBe(true)
    })

    it('should call detectPatternStaleness', async () => {
      service.injectPhase10Services(staleness, historyRepo)
      await service.collectWeeklyData('claw-test')
      expect(staleness.detect).toHaveBeenCalledWith('claw-test')
    })

    it('should call computeHealthScore', async () => {
      service.injectPhase10Services(staleness, historyRepo)
      await service.collectWeeklyData('claw-test')
      expect(staleness.computeHealthScore).toHaveBeenCalledWith('claw-test')
    })

    it('should work as fallback when phase10 services not injected', async () => {
      const data = await service.collectWeeklyData('claw-test')
      expect(data).toBeDefined()
      // patternHealth 和 carapaceHistory 在未注入时应该是 null/undefined 或空值
    })
  })

  describe('triggerWeeklyBriefing', () => {
    it('should create a weekly type briefing', async () => {
      service.injectPhase10Services(staleness, historyRepo)
      await service.triggerWeeklyBriefing('claw-test')
      expect(briefingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'weekly', clawId: 'claw-test' })
      )
    })
  })
})
