/**
 * HeartbeatDataCollector Unit Tests
 * 验证从本地数据源被动聚合心跳数据的各个分支
 */

import { describe, it, expect, vi } from 'vitest'
import { HeartbeatDataCollector } from '../../src/services/heartbeat-data-collector.js'
import type { IClawRepository } from '../../src/db/repositories/interfaces/claw.repository.interface.js'
import type { ICircleRepository } from '../../src/db/repositories/interfaces/circle.repository.interface.js'

function makeMockClaw(overrides: Partial<{ tags: string[]; statusText?: string }> = {}) {
  return {
    clawId: 'claw-a',
    publicKey: 'pk-a',
    displayName: 'Test',
    autonomyConfig: null,
    notificationPrefs: null,
    createdAt: '2026-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  } as any
}

function makeMockClawRepo(claw: any): IClawRepository {
  return {
    findById: vi.fn().mockResolvedValue(claw),
  } as any
}

function makeMockCircleRepo(circles: any[]): ICircleRepository {
  return {
    listCircles: vi.fn().mockResolvedValue(circles),
  } as any
}

describe('HeartbeatDataCollector', () => {
  describe('collect - claw not found', () => {
    it('should return isKeepalive when claw does not exist', async () => {
      const clawRepo = makeMockClawRepo(null)
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('missing-claw')
      expect(result).toEqual({ isKeepalive: true })
    })
  })

  describe('collect - interests extraction', () => {
    it('should return undefined interests when no tags and no circles', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: [] }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toBeUndefined()
    })

    it('should include tags in interests', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['Rust', 'AI', 'Design'] }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toContain('rust')
      expect(result.interests).toContain('ai')
    })

    it('should include circle name keywords in interests', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: [] }))
      const circleRepo = makeMockCircleRepo([
        { id: 'c1', name: 'tech buddies', description: null },
      ])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toContain('tech')
      expect(result.interests).toContain('buddies')
    })

    it('should include circle description keywords when description is provided', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: [] }))
      const circleRepo = makeMockCircleRepo([
        { id: 'c1', name: 'code', description: 'programming and software' },
      ])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toContain('programming')
      expect(result.interests).toContain('software')
    })

    it('should handle null circle description gracefully', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['tech'] }))
      const circleRepo = makeMockCircleRepo([
        { id: 'c1', name: 'mygroup', description: null },
      ])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toContain('tech')
    })

    it('should deduplicate interests from tags and circles', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['tech'] }))
      const circleRepo = makeMockCircleRepo([
        { id: 'c1', name: 'tech projects', description: null },
      ])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      const techCount = result.interests!.filter((i) => i === 'tech').length
      expect(techCount).toBe(1)
    })

    it('should slice interests to max 20', async () => {
      const tags = Array.from({ length: 25 }, (_, i) => `tag${String(i).padStart(2, '0')}`)
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests!.length).toBeLessThanOrEqual(20)
    })

    it('should handle undefined tags (null coalesce)', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: undefined as any }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.interests).toBeUndefined()
    })
  })

  describe('collect - recentTopics from statusText', () => {
    it('should set recentTopics when statusText is provided', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ statusText: '正在研究 Rust' }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.recentTopics).toBe('正在研究 Rust')
    })

    it('should return undefined recentTopics when statusText is empty string', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ statusText: '' }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.recentTopics).toBeUndefined()
    })

    it('should return undefined recentTopics when statusText is not set', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({}))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.recentTopics).toBeUndefined()
    })
  })

  describe('collect - availability', () => {
    it('should always return undefined availability in Phase 1', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({}))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.availability).toBeUndefined()
    })
  })

  describe('collect - isKeepalive', () => {
    it('should return isKeepalive=false when claw exists', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({}))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const result = await collector.collect('claw-a')
      expect(result.isKeepalive).toBe(false)
    })
  })

  // ─── Phase 3: PearlService 注入 ─────────────────────────────────────────
  describe('injectPearlService (Phase 3)', () => {
    it('should include pearl domain_tags in interests when PearlService is injected', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['tech'] }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const mockPearlService = {
        getPearlDomainTags: vi.fn().mockResolvedValue(['AI', 'LLM']),
      } as any

      collector.injectPearlService(mockPearlService)
      const result = await collector.collect('claw-a')

      expect(result.interests).toContain('tech')
      expect(result.interests).toContain('AI')
      expect(result.interests).toContain('LLM')
      expect(mockPearlService.getPearlDomainTags).toHaveBeenCalledOnce()
    })

    it('should still work correctly without PearlService injection', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['tech'] }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)
      // No injectPearlService call

      const result = await collector.collect('claw-a')
      expect(result.interests).toContain('tech')
      // No AI/LLM from pearls since pearlService is not injected
    })

    it('should deduplicate tags from profile and pearl sources', async () => {
      const clawRepo = makeMockClawRepo(makeMockClaw({ tags: ['AI'] }))
      const circleRepo = makeMockCircleRepo([])
      const collector = new HeartbeatDataCollector(clawRepo, circleRepo)

      const mockPearlService = {
        getPearlDomainTags: vi.fn().mockResolvedValue(['AI', 'design']),
      } as any

      collector.injectPearlService(mockPearlService)
      const result = await collector.collect('claw-a')

      expect(result.interests!.filter(t => t === 'AI')).toHaveLength(1)
      expect(result.interests).toContain('design')
    })
  })
})
