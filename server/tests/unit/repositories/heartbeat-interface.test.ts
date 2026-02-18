/**
 * IHeartbeatRepository 接口合规性测试
 * 验证接口中所有方法签名正确存在
 */

import { describe, it, expect } from 'vitest'
import type { IHeartbeatRepository, HeartbeatRecord } from '../../../src/db/repositories/interfaces/heartbeat.repository.interface.js'

describe('IHeartbeatRepository interface', () => {
  it('should be a valid TypeScript interface (type-level test)', () => {
    // 验证类型可被实例化（编译时检查）
    const mockRepo: IHeartbeatRepository = {
      create: async () => {},
      getLatest: async () => null,
      getLatestForClaw: async () => [],
      getSince: async () => [],
      deleteOlderThan: async () => 0,
    }
    expect(mockRepo).toBeDefined()
    expect(typeof mockRepo.create).toBe('function')
    expect(typeof mockRepo.getLatest).toBe('function')
    expect(typeof mockRepo.getLatestForClaw).toBe('function')
    expect(typeof mockRepo.getSince).toBe('function')
    expect(typeof mockRepo.deleteOlderThan).toBe('function')
  })

  it('should define HeartbeatRecord type correctly', () => {
    const record: HeartbeatRecord = {
      id: 'hb-001',
      fromClawId: 'claw-a',
      toClawId: 'claw-b',
      interests: ['tech', 'design'],
      availability: '工作日 9-18 点活跃',
      recentTopics: '最近在研究 Rust',
      isKeepalive: false,
      createdAt: '2026-02-18T00:00:00.000Z',
    }
    expect(record.id).toBe('hb-001')
    expect(record.interests).toEqual(['tech', 'design'])
    expect(record.isKeepalive).toBe(false)
  })

  it('should allow optional fields in HeartbeatRecord', () => {
    const minimalRecord: HeartbeatRecord = {
      id: 'hb-002',
      fromClawId: 'claw-a',
      toClawId: 'claw-b',
      isKeepalive: true,
      createdAt: '2026-02-18T00:00:00.000Z',
    }
    expect(minimalRecord.interests).toBeUndefined()
    expect(minimalRecord.availability).toBeUndefined()
    expect(minimalRecord.recentTopics).toBeUndefined()
  })
})
