/**
 * ProxyToMService Unit Tests
 * 包含 computeExpertiseTags 纯函数测试 + 服务方法测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProxyToMService } from '../../../src/services/proxy-tom.service.js'
import type { IFriendModelRepository, FriendModelRecord } from '../../../src/db/repositories/interfaces/friend-model.repository.interface.js'
import type { EventBus } from '../../../src/services/event-bus.js'

// ─────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────

function createMockRepo(): IFriendModelRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    updateFromHeartbeat: vi.fn().mockResolvedValue(undefined),
    touchInteraction: vi.fn().mockResolvedValue(undefined),
    updateLayer1Fields: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockEventBus(): EventBus {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as EventBus
}

function buildRecord(overrides: Partial<FriendModelRecord> = {}): FriendModelRecord {
  return {
    clawId: 'claw-a',
    friendId: 'claw-b',
    lastKnownState: null,
    inferredInterests: [],
    expertiseTags: {},
    lastHeartbeatAt: null,
    lastInteractionAt: null,
    inferredNeeds: null,
    emotionalTone: null,
    knowledgeGaps: null,
    updatedAt: '2026-02-18T10:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────
// computeExpertiseTags
// ─────────────────────────────────────────────

describe('ProxyToMService.computeExpertiseTags', () => {
  let svc: ProxyToMService

  beforeEach(() => {
    const repo = createMockRepo()
    const eventBus = createMockEventBus()
    svc = new ProxyToMService(repo, eventBus)
  })

  it('首次出现的 tag 初始值为 0.3', () => {
    const result = svc.computeExpertiseTags({}, ['AI', '投资'])
    expect(result['AI']).toBeCloseTo(0.3)
    expect(result['投资']).toBeCloseTo(0.3)
  })

  it('持续出现的 tag 信心值增加 (+0.05)', () => {
    const after1 = svc.computeExpertiseTags({}, ['AI'])   // 0.3
    const after2 = svc.computeExpertiseTags(after1, ['AI']) // 0.35
    expect(after2['AI']).toBeCloseTo(0.35)
  })

  it('持续出现的 tag 不超过 1.0', () => {
    let tags: Record<string, number> = {}
    for (let i = 0; i < 100; i++) {
      tags = svc.computeExpertiseTags(tags, ['AI'])
    }
    expect(tags['AI']).toBeLessThanOrEqual(1.0)
  })

  it('消失的 tag 信心值衰减 (-0.02)', () => {
    const after1 = svc.computeExpertiseTags({}, ['AI'])  // 0.3
    const after2 = svc.computeExpertiseTags(after1, [])  // 0.3 - 0.02 = 0.28
    expect(after2['AI']).toBeCloseTo(0.28)
  })

  it('低于 0.1 的 tag 被清除', () => {
    let tags: Record<string, number> = { AI: 0.11 }
    tags = svc.computeExpertiseTags(tags, [])  // 0.11 - 0.02 = 0.09 → 清除
    expect(tags['AI']).toBeUndefined()
  })

  it('interests 为空时全部 tag 衰减', () => {
    const tags = svc.computeExpertiseTags({ AI: 0.5, 投资: 0.3 }, [])
    expect(tags['AI']).toBeCloseTo(0.48)
    expect(tags['投资']).toBeCloseTo(0.28)
  })

  it('空输入 + 空 current → 返回空对象', () => {
    const result = svc.computeExpertiseTags({}, [])
    expect(result).toEqual({})
  })

  it('多次衰减后低于 0.1 的 tag 被清除', () => {
    // 0.3 首次，再连续 11 次衰减：0.3 - 11*0.02 = 0.08 → 清除
    let tags = svc.computeExpertiseTags({}, ['AI'])
    for (let i = 0; i < 11; i++) {
      tags = svc.computeExpertiseTags(tags, [])
    }
    expect(tags['AI']).toBeUndefined()
  })

  it('新 tag 出现，旧 tag 衰减', () => {
    const tags = svc.computeExpertiseTags({ 旧Tag: 0.5 }, ['新Tag'])
    expect(tags['新Tag']).toBeCloseTo(0.3)   // 首次出现
    expect(tags['旧Tag']).toBeCloseTo(0.48)  // 衰减
  })
})

// ─────────────────────────────────────────────
// initializeFriendModel + removeFriendModel
// ─────────────────────────────────────────────

describe('ProxyToMService lifecycle', () => {
  let repo: IFriendModelRepository
  let svc: ProxyToMService

  beforeEach(() => {
    repo = createMockRepo()
    svc = new ProxyToMService(repo, createMockEventBus())
  })

  describe('initializeFriendModel', () => {
    it('should call repo.create with correct params', async () => {
      await svc.initializeFriendModel('claw-a', 'claw-b')
      expect(repo.create).toHaveBeenCalledWith({ clawId: 'claw-a', friendId: 'claw-b' })
    })
  })

  describe('removeFriendModel', () => {
    it('should call repo.delete with correct params', async () => {
      await svc.removeFriendModel('claw-a', 'claw-b')
      expect(repo.delete).toHaveBeenCalledWith('claw-a', 'claw-b')
    })
  })
})

// ─────────────────────────────────────────────
// updateFromHeartbeat
// ─────────────────────────────────────────────

describe('ProxyToMService.updateFromHeartbeat', () => {
  let repo: IFriendModelRepository
  let svc: ProxyToMService

  beforeEach(() => {
    repo = createMockRepo()
    svc = new ProxyToMService(repo, createMockEventBus())
  })

  it('should update inferredInterests and expertiseTags from heartbeat', async () => {
    vi.mocked(repo.get).mockResolvedValue(null)

    await svc.updateFromHeartbeat('claw-a', 'claw-b', {
      interests: ['AI', 'Design'],
      recentTopics: '最近在研究 AI',
      isKeepalive: false,
    }, null)

    expect(repo.updateFromHeartbeat).toHaveBeenCalledWith(
      'claw-a', 'claw-b',
      expect.objectContaining({
        inferredInterests: ['AI', 'Design'],
        lastKnownState: '最近在研究 AI',
      })
    )
  })

  it('should NOT update semantic fields on keepalive heartbeat', async () => {
    const existing = buildRecord({ inferredInterests: ['Rust'], expertiseTags: { Rust: 0.5 } })
    vi.mocked(repo.get).mockResolvedValue(existing)

    await svc.updateFromHeartbeat('claw-a', 'claw-b', {
      interests: [],
      isKeepalive: true,
    }, existing)

    // On keepalive, inferredInterests should NOT change (keeps existing)
    const call = vi.mocked(repo.updateFromHeartbeat).mock.calls[0]
    expect(call[2].inferredInterests).toEqual(['Rust'])
  })

  it('should NOT update lastKnownState when recentTopics is empty', async () => {
    await svc.updateFromHeartbeat('claw-a', 'claw-b', {
      interests: ['AI'],
      recentTopics: '',
      isKeepalive: false,
    }, null)

    const call = vi.mocked(repo.updateFromHeartbeat).mock.calls[0]
    expect(call[2].lastKnownState).toBeUndefined()
  })

  it('should update lastKnownState when recentTopics is non-empty', async () => {
    await svc.updateFromHeartbeat('claw-a', 'claw-b', {
      interests: [],
      recentTopics: '最近在研究 Rust',
      isKeepalive: false,
    }, null)

    const call = vi.mocked(repo.updateFromHeartbeat).mock.calls[0]
    expect(call[2].lastKnownState).toBe('最近在研究 Rust')
  })
})

// ─────────────────────────────────────────────
// touchInteraction
// ─────────────────────────────────────────────

describe('ProxyToMService.touchInteraction', () => {
  let repo: IFriendModelRepository
  let svc: ProxyToMService

  beforeEach(() => {
    repo = createMockRepo()
    svc = new ProxyToMService(repo, createMockEventBus())
  })

  it('should call repo.touchInteraction with correct params', async () => {
    await svc.touchInteraction('claw-a', 'claw-b')
    expect(repo.touchInteraction).toHaveBeenCalledWith('claw-a', 'claw-b')
  })
})

// ─────────────────────────────────────────────
// getModel + getAllModels
// ─────────────────────────────────────────────

describe('ProxyToMService.getModel and getAllModels', () => {
  let repo: IFriendModelRepository
  let svc: ProxyToMService

  beforeEach(() => {
    repo = createMockRepo()
    svc = new ProxyToMService(repo, createMockEventBus())
  })

  it('getModel should delegate to repo.get', async () => {
    const mockRecord = buildRecord()
    vi.mocked(repo.get).mockResolvedValue(mockRecord)
    const result = await svc.getModel('claw-a', 'claw-b')
    expect(repo.get).toHaveBeenCalledWith('claw-a', 'claw-b')
    expect(result).toBe(mockRecord)
  })

  it('getAllModels should delegate to repo.getAll', async () => {
    const mockRecords = [buildRecord(), buildRecord({ friendId: 'claw-c' })]
    vi.mocked(repo.getAll).mockResolvedValue(mockRecords)
    const result = await svc.getAllModels('claw-a')
    expect(repo.getAll).toHaveBeenCalledWith('claw-a')
    expect(result).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────
// findInterestOverlaps
// ─────────────────────────────────────────────

describe('ProxyToMService.findInterestOverlaps', () => {
  let repo: IFriendModelRepository
  let svc: ProxyToMService

  beforeEach(() => {
    repo = createMockRepo()
    svc = new ProxyToMService(repo, createMockEventBus())
  })

  it('should find shared interests between friends', async () => {
    vi.mocked(repo.get)
      .mockResolvedValueOnce(buildRecord({ friendId: 'bob', inferredInterests: ['AI', 'Design', 'Rust'] }))
      .mockResolvedValueOnce(buildRecord({ friendId: 'alice', inferredInterests: ['AI', 'Rust', 'Python'] }))

    const result = await svc.findInterestOverlaps('claw-a', ['bob', 'alice'])
    const overlap = result.find((r) => r.friendA === 'bob' && r.friendB === 'alice')
    expect(overlap).toBeDefined()
    expect(overlap!.sharedInterests).toContain('AI')
    expect(overlap!.sharedInterests).toContain('Rust')
    expect(overlap!.sharedInterests).not.toContain('Design')
    expect(overlap!.sharedInterests).not.toContain('Python')
  })

  it('should return empty array when no overlaps', async () => {
    vi.mocked(repo.get)
      .mockResolvedValueOnce(buildRecord({ friendId: 'bob', inferredInterests: ['Design'] }))
      .mockResolvedValueOnce(buildRecord({ friendId: 'alice', inferredInterests: ['Python'] }))

    const result = await svc.findInterestOverlaps('claw-a', ['bob', 'alice'])
    expect(result).toHaveLength(0)
  })

  it('should return empty array when only one friend', async () => {
    vi.mocked(repo.get).mockResolvedValue(buildRecord({ friendId: 'bob', inferredInterests: ['AI'] }))
    const result = await svc.findInterestOverlaps('claw-a', ['bob'])
    expect(result).toHaveLength(0)
  })

  it('should skip pairs where friend model is null', async () => {
    vi.mocked(repo.get)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildRecord({ friendId: 'alice', inferredInterests: ['AI'] }))

    const result = await svc.findInterestOverlaps('claw-a', ['bob', 'alice'])
    expect(result).toHaveLength(0)
  })
})
