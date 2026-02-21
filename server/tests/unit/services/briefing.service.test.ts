/**
 * BriefingService 单元测试（Phase 6）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BriefingService } from '../../../src/services/briefing.service.js'
import type { IBriefingRepository } from '../../../src/db/repositories/interfaces/briefing.repository.interface.js'
import type { HostNotifier } from '../../../src/services/host-notifier.js'
import type { MicroMoltService } from '../../../src/services/micro-molt.service.js'

function createMockBriefingRepo(): IBriefingRepository {
  return {
    create: vi.fn().mockImplementation(async (data) => ({
      ...data,
      generatedAt: new Date().toISOString(),
      acknowledgedAt: null,
    })),
    findLatest: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  }
}

function createMockHostNotifier(): HostNotifier {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
    triggerAgent: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockResolvedValue(true),
  }
}

function createMockMicroMoltService(): MicroMoltService {
  return {
    generateSuggestions: vi.fn().mockResolvedValue([]),
  } as unknown as MicroMoltService
}

describe('BriefingService', () => {
  let service: BriefingService
  let briefingRepo: IBriefingRepository
  let hostNotifier: HostNotifier
  let microMoltService: MicroMoltService

  beforeEach(() => {
    briefingRepo = createMockBriefingRepo()
    hostNotifier = createMockHostNotifier()
    microMoltService = createMockMicroMoltService()
    service = new BriefingService(briefingRepo, hostNotifier, microMoltService)
  })

  describe('collectDailyData', () => {
    it('should return BriefingRawData shape', async () => {
      const data = await service.collectDailyData('claw-test')
      expect(data).toHaveProperty('messages')
      expect(data).toHaveProperty('reflexAlerts')
      expect(data).toHaveProperty('pearlActivity')
      expect(data).toHaveProperty('relationshipWarnings')
      expect(data).toHaveProperty('tomChanges')
      expect(data).toHaveProperty('pendingDrafts')
      expect(data).toHaveProperty('heartbeatInsights')
      expect(data).toHaveProperty('microMoltSuggestions')
    })

    it('should include routingStats field (Phase 9)', async () => {
      const data = await service.collectDailyData('claw-test')
      expect(data).toHaveProperty('routingStats')
      expect(data.routingStats).toMatchObject({
        routedByMe: expect.any(Number),
        routedToMe: expect.any(Number),
        citationsCount: expect.any(Number),
      })
    })

    it('should include Micro-Molt suggestions', async () => {
      vi.mocked(microMoltService.generateSuggestions).mockResolvedValue([{
        type: 'disable',
        description: 'Test suggestion',
        cliCommand: 'clawbuds reflex disable --id test',
        confidence: 0.9,
      }])
      const data = await service.collectDailyData('claw-test')
      expect(data.microMoltSuggestions).toHaveLength(1)
    })
  })

  describe('saveBriefing', () => {
    it('should create briefing with brief_ prefix id', async () => {
      const record = await service.saveBriefing('claw-test', '# Today Briefing')
      expect(record.id).toMatch(/^brief_/)
      expect(record.content).toBe('# Today Briefing')
      expect(briefingRepo.create).toHaveBeenCalled()
    })

    it('should accept rawData parameter', async () => {
      const rawData = { messages: [], reflexAlerts: [] }
      const record = await service.saveBriefing('claw-test', '# Today Briefing', rawData as any)
      expect(record).toBeTruthy()
    })
  })

  describe('triggerBriefingGeneration', () => {
    it('should call hostNotifier.triggerAgent with BRIEFING_REQUEST', async () => {
      await service.triggerBriefingGeneration('claw-test')
      expect(hostNotifier.triggerAgent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BRIEFING_REQUEST' })
      )
    })

    it('should return a batchId', async () => {
      const batchId = await service.triggerBriefingGeneration('claw-test')
      expect(typeof batchId).toBe('string')
      expect(batchId.length).toBeGreaterThan(0)
    })
  })

  describe('deliverBriefing', () => {
    it('should call hostNotifier.notify', async () => {
      const briefing = {
        id: 'brief_test',
        clawId: 'claw-test',
        type: 'daily' as const,
        content: '# Test',
        rawData: {},
        generatedAt: new Date().toISOString(),
        acknowledgedAt: null,
      }
      await service.deliverBriefing('claw-test', briefing)
      expect(hostNotifier.notify).toHaveBeenCalledWith(
        expect.stringContaining('简报')
      )
    })
  })

  describe('generateFallbackBriefing', () => {
    it('should not call hostNotifier.triggerAgent', async () => {
      await service.generateFallbackBriefing('claw-test')
      expect(hostNotifier.triggerAgent).not.toHaveBeenCalled()
      expect(briefingRepo.create).toHaveBeenCalled()
    })

    it('should save a briefing with fallback content', async () => {
      await service.generateFallbackBriefing('claw-test')
      const call = vi.mocked(briefingRepo.create).mock.calls[0][0]
      expect(call.content).toBeTruthy()
    })
  })

  describe('acknowledge', () => {
    it('should call repo.acknowledge', async () => {
      vi.mocked(briefingRepo.findLatest).mockResolvedValue({
        id: 'brief_x', clawId: 'claw-test', type: 'daily',
        content: '# x', rawData: {}, generatedAt: '2026-02-20T20:00:00Z', acknowledgedAt: null,
      })
      await service.acknowledge('brief_x', 'claw-test')
      expect(briefingRepo.acknowledge).toHaveBeenCalledWith('brief_x', expect.any(String))
    })
  })

  describe('getLatest', () => {
    it('should delegate to repo', async () => {
      await service.getLatest('claw-test')
      expect(briefingRepo.findLatest).toHaveBeenCalledWith('claw-test')
    })
  })
})
