/**
 * IImprintRepository 接口编译验证测试
 * 确认接口、类型定义可正常导入且类型正确
 */

import { describe, it, expect } from 'vitest'
import type {
  Imprint,
  IImprintRepository,
} from '../../../src/db/repositories/interfaces/imprint.repository.interface.js'

describe('IImprintRepository interface', () => {
  it('should be importable (compilation check)', () => {
    // If this file compiles, the interface exists and is valid
    expect(true).toBe(true)
  })

  it('should have correct Imprint type shape', () => {
    const imprint: Imprint = {
      id: 'imp_abc1234567',
      clawId: 'claw_test',
      friendId: 'friend_test',
      eventType: 'new_job',
      summary: 'Alice got a new job offer',
      sourceHeartbeatId: undefined,
      detectedAt: '2026-02-20T00:00:00Z',
    }
    expect(imprint.id).toMatch(/^imp_/)
    expect(imprint.eventType).toBe('new_job')
  })

  it('should accept all valid eventType values', () => {
    const validTypes: Imprint['eventType'][] = [
      'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other'
    ]
    expect(validTypes).toHaveLength(6)
  })

  it('IImprintRepository should have required methods', () => {
    // Type-level test: verify the interface shape via a mock implementation
    const mockRepo: IImprintRepository = {
      create: async (data) => ({ ...data, id: 'imp_test' } as Imprint),
      findByClawAndFriend: async () => [],
      findRecentByClaw: async () => [],
    }
    expect(typeof mockRepo.create).toBe('function')
    expect(typeof mockRepo.findByClawAndFriend).toBe('function')
    expect(typeof mockRepo.findRecentByClaw).toBe('function')
  })
})
