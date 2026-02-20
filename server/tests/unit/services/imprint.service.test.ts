/**
 * ImprintService 单元测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImprintService } from '../../../src/services/imprint.service.js'
import type { IImprintRepository, Imprint } from '../../../src/db/repositories/interfaces/imprint.repository.interface.js'

const mockImprint: Imprint = {
  id: 'imp_abc1234567',
  clawId: 'claw-a',
  friendId: 'friend-1',
  eventType: 'new_job',
  summary: 'Alice got a new job',
  detectedAt: '2026-02-20T00:00:00Z',
}

function makeMockRepo(): IImprintRepository {
  return {
    create: vi.fn().mockResolvedValue(mockImprint),
    findByClawAndFriend: vi.fn().mockResolvedValue([mockImprint]),
    findRecentByClaw: vi.fn().mockResolvedValue([mockImprint]),
  }
}

describe('ImprintService', () => {
  let service: ImprintService
  let mockRepo: IImprintRepository

  beforeEach(() => {
    mockRepo = makeMockRepo()
    service = new ImprintService(mockRepo)
  })

  describe('record()', () => {
    it('should create an imprint with imp_ prefix id', async () => {
      const result = await service.record('claw-a', 'friend-1', 'new_job', 'Alice got a job')
      expect(result.id).toMatch(/^imp_/)
      expect(result.eventType).toBe('new_job')
    })

    it('should pass sourceHeartbeatId when provided', async () => {
      const createSpy = mockRepo.create as ReturnType<typeof vi.fn>
      await service.record('claw-a', 'friend-1', 'travel', 'Bob is traveling', 'hb_test')
      const [data] = createSpy.mock.calls[0]
      expect(data.sourceHeartbeatId).toBe('hb_test')
    })

    it('should reject summary longer than 200 chars', async () => {
      const longSummary = 'x'.repeat(201)
      await expect(service.record('claw-a', 'friend-1', 'other', longSummary))
        .rejects.toThrow()
    })

    it('should reject invalid event_type', async () => {
      await expect(service.record('claw-a', 'friend-1', 'invalid_type' as any, 'test'))
        .rejects.toThrow()
    })
  })

  describe('findByFriend()', () => {
    it('should return imprints for a friend', async () => {
      const results = await service.findByFriend('claw-a', 'friend-1')
      expect(results).toHaveLength(1)
      expect(results[0].friendId).toBe('friend-1')
    })
  })

  describe('findRecent()', () => {
    it('should return recent imprints across friends', async () => {
      const results = await service.findRecent('claw-a', '2026-02-01T00:00:00Z')
      expect(results).toHaveLength(1)
    })
  })
})
