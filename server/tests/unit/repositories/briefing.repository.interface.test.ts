/**
 * IBriefingRepository 接口编译验证测试（Phase 6）
 */

import { describe, it, expect } from 'vitest'
import type {
  BriefingRecord,
  IBriefingRepository,
} from '../../../src/db/repositories/interfaces/briefing.repository.interface.js'

describe('IBriefingRepository interface', () => {
  it('should be importable (compilation check)', () => {
    expect(true).toBe(true)
  })

  it('should have correct BriefingRecord type shape', () => {
    const record: BriefingRecord = {
      id: 'brief_test123',
      clawId: 'claw_abc',
      type: 'daily',
      content: '# Today Briefing',
      rawData: {},
      generatedAt: '2026-02-20T08:00:00Z',
      acknowledgedAt: null,
    }
    expect(record.id).toMatch(/^brief_/)
    expect(record.type).toBe('daily')
    expect(record.acknowledgedAt).toBeNull()
  })

  it('should accept weekly type', () => {
    const record: BriefingRecord = {
      id: 'brief_weekly001',
      clawId: 'claw_abc',
      type: 'weekly',
      content: '# Weekly Briefing',
      rawData: { messages: [] },
      generatedAt: '2026-02-20T08:00:00Z',
      acknowledgedAt: '2026-02-20T09:00:00Z',
    }
    expect(record.type).toBe('weekly')
  })

  it('IBriefingRepository should have required methods', () => {
    const mockRepo: IBriefingRepository = {
      create: async (data) => ({
        ...data,
        id: 'brief_mock',
        generatedAt: new Date().toISOString(),
        acknowledgedAt: null,
      }),
      findLatest: async () => null,
      findHistory: async () => [],
      acknowledge: async () => {},
      getUnreadCount: async () => 0,
      deleteOlderThan: async () => 0,
    }
    expect(typeof mockRepo.create).toBe('function')
    expect(typeof mockRepo.findLatest).toBe('function')
    expect(typeof mockRepo.findHistory).toBe('function')
    expect(typeof mockRepo.acknowledge).toBe('function')
    expect(typeof mockRepo.getUnreadCount).toBe('function')
    expect(typeof mockRepo.deleteOlderThan).toBe('function')
  })
})
