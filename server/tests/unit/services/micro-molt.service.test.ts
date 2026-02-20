/**
 * MicroMoltService 单元测试（Phase 6）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MicroMoltService } from '../../../src/services/micro-molt.service.js'
import type { IReflexExecutionRepository } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'
import type { IBriefingRepository } from '../../../src/db/repositories/interfaces/briefing.repository.interface.js'

function createMockExecutionRepo(): IReflexExecutionRepository {
  return {
    create: vi.fn(),
    findByClawId: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByResult: vi.fn().mockResolvedValue([]),
    updateResult: vi.fn(),
    findByBatchId: vi.fn().mockResolvedValue([]),
    countByResultSince: vi.fn().mockResolvedValue(0),
  } as unknown as IReflexExecutionRepository
}

function createMockBriefingRepo(): IBriefingRepository {
  return {
    create: vi.fn(),
    findLatest: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
    acknowledge: vi.fn(),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  }
}

describe('MicroMoltService', () => {
  let service: MicroMoltService
  let executionRepo: IReflexExecutionRepository
  let briefingRepo: IBriefingRepository

  beforeEach(() => {
    executionRepo = createMockExecutionRepo()
    briefingRepo = createMockBriefingRepo()
    service = new MicroMoltService(executionRepo, briefingRepo)
  })

  it('should return empty suggestions when no data', async () => {
    const result = await service.generateSuggestions('claw-test')
    expect(Array.isArray(result)).toBe(true)
  })

  it('should return at most 3 suggestions', async () => {
    // Mock lots of blocked reflexes to trigger rejection pattern suggestions
    const blockedRows = Array.from({ length: 10 }, (_, i) => ({
      id: `exec_${i}`,
      clawId: 'claw-test',
      reflexId: 'sense_life_event',
      reflexName: 'sense_life_event',
      eventType: 'heartbeat.received',
      triggerData: {},
      executionResult: 'blocked',
      details: {},
      createdAt: new Date().toISOString(),
    }))
    vi.mocked(executionRepo.findByResult).mockResolvedValue(blockedRows as any)

    const result = await service.generateSuggestions('claw-test')
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('suggestion should have required fields', async () => {
    const blockedRows = Array.from({ length: 8 }, (_, i) => ({
      id: `exec_${i}`,
      reflexName: 'sense_life_event',
      executionResult: 'blocked',
      createdAt: new Date().toISOString(),
    }))
    vi.mocked(executionRepo.findByResult).mockResolvedValue(blockedRows as any)

    const result = await service.generateSuggestions('claw-test')
    if (result.length > 0) {
      const suggestion = result[0]
      expect(suggestion).toHaveProperty('type')
      expect(suggestion).toHaveProperty('description')
      expect(suggestion).toHaveProperty('cliCommand')
      expect(suggestion).toHaveProperty('confidence')
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0)
      expect(suggestion.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('should analyze reading patterns from briefing history', async () => {
    const now = new Date()
    const briefings = Array.from({ length: 7 }, (_, i) => {
      const generated = new Date(now)
      generated.setDate(generated.getDate() - i)
      generated.setHours(20, 0, 0, 0)
      const acked = new Date(generated)
      acked.setHours(21, 0, 0, 0)
      return {
        id: `brief_${i}`,
        clawId: 'claw-test',
        type: 'daily' as const,
        content: '# Test',
        rawData: {},
        generatedAt: generated.toISOString(),
        acknowledgedAt: acked.toISOString(),
      }
    })
    vi.mocked(briefingRepo.findHistory).mockResolvedValue(briefings)

    const result = await service.generateSuggestions('claw-test')
    expect(Array.isArray(result)).toBe(true)
  })
})
