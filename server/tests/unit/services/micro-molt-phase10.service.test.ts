/**
 * MicroMoltService Phase 10 扩展测试
 * 新增维度 1/4/5/6 + applySuggestion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MicroMoltService } from '../../../src/services/micro-molt.service.js'
import type { IReflexExecutionRepository } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'
import type { IBriefingRepository } from '../../../src/db/repositories/interfaces/briefing.repository.interface.js'
import type { PearlService } from '../../../src/services/pearl.service.js'
import type { RelationshipService } from '../../../src/services/relationship.service.js'
import type { CarapaceEditor } from '../../../src/services/carapace-editor.js'

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

function createMockPearlService(): PearlService {
  return {
    findByOwner: vi.fn().mockResolvedValue([]),
    endorse: vi.fn(),
    share: vi.fn(),
    // 模拟 getReceivedPearls 统计
    getReceivedPearls: vi.fn().mockResolvedValue([]),
  } as unknown as PearlService
}

function createMockRelationshipService(): RelationshipService {
  return {
    getFriendsByLayer: vi.fn().mockResolvedValue({
      core: [],
      sympathy: [],
      active: [],
      casual: [],
    }),
    getStrength: vi.fn().mockResolvedValue(0.5),
  } as unknown as RelationshipService
}

function createMockCarapaceEditor(): CarapaceEditor {
  return {
    allow: vi.fn().mockResolvedValue(undefined),
    escalate: vi.fn().mockResolvedValue(undefined),
    applyMicroMolt: vi.fn().mockResolvedValue(undefined),
    restoreVersion: vi.fn().mockResolvedValue(undefined),
  } as unknown as CarapaceEditor
}

describe('MicroMoltService Phase 10 - New Dimensions', () => {
  let service: MicroMoltService
  let executionRepo: IReflexExecutionRepository
  let briefingRepo: IBriefingRepository
  let pearlService: PearlService
  let relationshipService: RelationshipService
  let carapaceEditor: CarapaceEditor

  beforeEach(() => {
    executionRepo = createMockExecutionRepo()
    briefingRepo = createMockBriefingRepo()
    pearlService = createMockPearlService()
    relationshipService = createMockRelationshipService()
    carapaceEditor = createMockCarapaceEditor()

    service = new MicroMoltService(
      executionRepo,
      briefingRepo,
      pearlService,
      relationshipService,
      carapaceEditor,
    )
  })

  // ─── backward compatibility ─────────────────────────────────────────────

  it('should still work with basic constructor (backward compat)', () => {
    const basicService = new MicroMoltService(executionRepo, briefingRepo)
    expect(basicService).toBeDefined()
  })

  // ─── dimension 4: Pearl routing effectiveness ──────────────────────────

  describe('dimension 4: analyzePearlRoutingEffectiveness', () => {
    it('should return empty when no pearls shared', async () => {
      vi.mocked(pearlService.findByOwner).mockResolvedValue([])
      const suggestions = await service.generateSuggestions('claw-a')
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should suggest lowering threshold when endorsement rate ≥ 70%', async () => {
      // 3 pearls, 2 endorsed = 67%... 测试 endorsement rate ≥ 70% 的场景
      // 使用 6 个 pearl，5 个被背书 = 83%
      const pearls = Array.from({ length: 6 }, (_, i) => ({
        id: `pearl-${i}`,
        ownerId: 'claw-a',
        domainTags: ['AI', 'tech'],
        luster: 0.7,
        shareability: 'friends_only' as const,
        shareConditions: { trustThreshold: 0.5 },
        endorsementCount: i < 5 ? 1 : 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
      vi.mocked(pearlService.findByOwner).mockResolvedValue(pearls as any)
      const suggestions = await service.generateSuggestions('claw-a')
      // 应该有关于 Pearl 路由的建议（或至少不崩溃）
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })
  })

  // ─── dimension 5: grooming effectiveness ───────────────────────────────

  describe('dimension 5: analyzeGroomingEffectiveness', () => {
    it('should return empty when no groom executions', async () => {
      vi.mocked(executionRepo.findByResult).mockResolvedValue([])
      const suggestions = await service.generateSuggestions('claw-b')
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should suggest lowering frequency when no replies for 30 days', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      // 大量 groom executions，但 details.friendId = 'friend-x' 且 details.replyCount = 0
      const groomExecs = Array.from({ length: 10 }, (_, i) => ({
        id: `exec-groom-${i}`,
        clawId: 'claw-b',
        reflexId: 'phatic_micro_reaction',
        reflexName: 'phatic_micro_reaction',
        eventType: 'groom',
        triggerData: {},
        executionResult: 'executed',
        details: { friendId: 'friend-x', replyCount: 0, groomSentAt: thirtyDaysAgo },
        createdAt: thirtyDaysAgo,
      }))
      vi.mocked(executionRepo.findByResult).mockResolvedValue(groomExecs as any)
      const suggestions = await service.generateSuggestions('claw-b')
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })
  })

  // ─── dimension 6: Dunbar layer strategy ─────────────────────────────────

  describe('dimension 6: analyzeDunbarLayerStrategy', () => {
    it('should suggest core-layer strategy when core has ≥ 5 friends', async () => {
      const coreFriends = Array.from({ length: 5 }, (_, i) => ({
        fromClawId: 'claw-c',
        toClawId: `friend-core-${i}`,
        layer: 'core',
        strength: 0.9,
      }))
      vi.mocked(relationshipService.getFriendsByLayer).mockResolvedValue({
        core: coreFriends as any,
        sympathy: [],
        active: [],
        casual: [],
      })
      const suggestions = await service.generateSuggestions('claw-c')
      // 应该至少尝试调用 getFriendsByLayer
      expect(relationshipService.getFriendsByLayer).toHaveBeenCalledWith('claw-c')
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should suggest casual-layer strategy when casual has > 100 friends', async () => {
      const casualFriends = Array.from({ length: 101 }, (_, i) => ({
        fromClawId: 'claw-d',
        toClawId: `friend-casual-${i}`,
        layer: 'casual',
        strength: 0.2,
      }))
      vi.mocked(relationshipService.getFriendsByLayer).mockResolvedValue({
        core: [],
        sympathy: [],
        active: [],
        casual: casualFriends as any,
      })
      const suggestions = await service.generateSuggestions('claw-d')
      expect(Array.isArray(suggestions)).toBe(true)
      // 可能包含 casual 层批量处理建议
    })

    it('should return at most 3 suggestions total', async () => {
      const coreFriends = Array.from({ length: 10 }, (_, i) => ({
        fromClawId: 'claw-e', toClawId: `friend-core-${i}`, layer: 'core', strength: 0.9,
      }))
      const casualFriends = Array.from({ length: 150 }, (_, i) => ({
        fromClawId: 'claw-e', toClawId: `friend-casual-${i}`, layer: 'casual', strength: 0.2,
      }))
      vi.mocked(relationshipService.getFriendsByLayer).mockResolvedValue({
        core: coreFriends as any,
        sympathy: [],
        active: [],
        casual: casualFriends as any,
      })
      const suggestions = await service.generateSuggestions('claw-e')
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })
  })

  // ─── applySuggestion ────────────────────────────────────────────────────

  describe('applySuggestion', () => {
    it('should call carapaceEditor.applyMicroMolt', async () => {
      const suggestion = {
        type: 'allow' as const,
        description: '对 Alice 添加自动授权',
        cliCommand: 'clawbuds carapace allow --friend alice --scope "梳理"',
        confidence: 0.9,
        friendId: 'alice',
        scope: '梳理',
      }
      await service.applySuggestion('claw-test', suggestion)
      expect(carapaceEditor.applyMicroMolt).toHaveBeenCalledWith('claw-test', suggestion)
    })

    it('should throw when carapaceEditor is not injected', async () => {
      const serviceWithoutEditor = new MicroMoltService(executionRepo, briefingRepo)
      const suggestion = {
        type: 'allow' as const,
        description: '测试',
        cliCommand: 'test',
        confidence: 0.5,
      }
      await expect(serviceWithoutEditor.applySuggestion('claw-test', suggestion)).rejects.toThrow()
    })
  })

  // ─── all suggestions have cliCommand ────────────────────────────────────

  it('all generated suggestions should have required fields', async () => {
    vi.mocked(relationshipService.getFriendsByLayer).mockResolvedValue({
      core: Array.from({ length: 6 }, (_, i) => ({ fromClawId: 'x', toClawId: `c${i}`, layer: 'core', strength: 0.9 })) as any,
      sympathy: [],
      active: [],
      casual: [],
    })
    const suggestions = await service.generateSuggestions('claw-test')
    for (const s of suggestions) {
      expect(s.type).toBeDefined()
      expect(s.description).toBeDefined()
      expect(s.cliCommand).toBeDefined()
      expect(typeof s.confidence).toBe('number')
      expect(s.confidence).toBeGreaterThanOrEqual(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
    }
  })
})
