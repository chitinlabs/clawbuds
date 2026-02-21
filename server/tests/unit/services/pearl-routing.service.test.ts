/**
 * PearlRoutingService Unit Tests (Phase 9)
 * T7-T11: preFilter / trustFilter / buildRoutingContext / executeRoute / recordRoutingEvent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PearlRoutingService } from '../../../src/services/pearl-routing.service.js'
import type { PearlService } from '../../../src/services/pearl.service.js'
import type { TrustService } from '../../../src/services/trust.service.js'
import type { ProxyToMService } from '../../../src/services/proxy-tom.service.js'
import type { HeartbeatService } from '../../../src/services/heartbeat.service.js'
import type { PearlMetadataRecord } from '../../../src/db/repositories/interfaces/pearl.repository.interface.js'
import type { HeartbeatRecord } from '../../../src/db/repositories/interfaces/heartbeat.repository.interface.js'

// ─── Mock factories ─────────────────────────────────────────────────────────

const makePearlMeta = (overrides: Partial<PearlMetadataRecord> = {}): PearlMetadataRecord => ({
  id: 'pearl-1',
  ownerId: 'owner-1',
  type: 'insight',
  triggerText: 'test trigger',
  domainTags: ['AI'],
  luster: 0.7,
  shareability: 'friends_only',
  shareConditions: null,
  createdAt: '2026-02-21T',
  updatedAt: '2026-02-21T',
  ...overrides,
})

const makeHeartbeat = (overrides: Partial<HeartbeatRecord> = {}): HeartbeatRecord => ({
  id: 'hb-1',
  fromClawId: 'friend-1',
  toClawId: 'owner-1',
  interests: ['AI', '教育'],
  isKeepalive: false,
  createdAt: '2026-02-21T',
  ...overrides,
})

function makePearlService(): jest.Mocked<Pick<PearlService, 'getRoutingCandidates' | 'share'>> {
  return {
    getRoutingCandidates: vi.fn(),
    share: vi.fn().mockResolvedValue(undefined),
  } as any
}

function makeTrustService(): Pick<TrustService, 'getComposite'> {
  return {
    getComposite: vi.fn().mockResolvedValue(0.7),
  } as any
}

function makeToMService(): Pick<ProxyToMService, 'getModel'> {
  return {
    getModel: vi.fn().mockResolvedValue(null),
  } as any
}

function makeHeartbeatService(): Pick<HeartbeatService, 'getLatestFrom'> {
  return {
    getLatestFrom: vi.fn().mockResolvedValue(null),
  } as any
}

// ─── preFilter ──────────────────────────────────────────────────────────────

describe('PearlRoutingService.preFilter (T7)', () => {
  let service: PearlRoutingService
  let pearlService: ReturnType<typeof makePearlService>

  beforeEach(() => {
    pearlService = makePearlService()
    service = new PearlRoutingService(
      pearlService as any,
      makeToMService() as any,
      makeTrustService() as any,
      makeHeartbeatService() as any,
    )
  })

  it('should return only pearls with domain_tags intersecting friendInterests', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ id: 'p1', domainTags: ['AI'] }),
      makePearlMeta({ id: 'p2', domainTags: ['产品设计', '教育'] }),
      makePearlMeta({ id: 'p3', domainTags: ['金融'] }),
    ])
    const result = await service.preFilter('owner-1', ['AI', '教育'])
    expect(result).toHaveLength(2)
    const ids = result.map(p => p.id)
    expect(ids).toContain('p1')  // AI ∩ [AI, 教育]
    expect(ids).toContain('p2')  // 教育 ∩ [AI, 教育]
    expect(ids).not.toContain('p3')  // 金融 ∩ [AI, 教育] = ∅
  })

  it('should return empty array when no intersection', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ id: 'p1', domainTags: ['金融'] }),
    ])
    const result = await service.preFilter('owner-1', ['AI'])
    expect(result).toHaveLength(0)
  })

  it('should return empty array when friendInterests is empty', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ id: 'p1', domainTags: ['AI'] }),
    ])
    const result = await service.preFilter('owner-1', [])
    expect(result).toHaveLength(0)
  })

  it('should return all candidates when all have matching tags', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ id: 'p1', domainTags: ['AI'] }),
      makePearlMeta({ id: 'p2', domainTags: ['AI', '教育'] }),
    ])
    const result = await service.preFilter('owner-1', ['AI'])
    expect(result).toHaveLength(2)
  })

  it('should call getRoutingCandidates with ownerId', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([])
    await service.preFilter('owner-xyz', ['AI'])
    expect(pearlService.getRoutingCandidates).toHaveBeenCalledWith('owner-xyz')
  })
})

// ─── trustFilter ─────────────────────────────────────────────────────────────

describe('PearlRoutingService.trustFilter (T8)', () => {
  let service: PearlRoutingService
  let trustService: ReturnType<typeof makeTrustService>

  beforeEach(() => {
    trustService = makeTrustService()
    service = new PearlRoutingService(
      makePearlService() as any,
      makeToMService() as any,
      trustService as any,
      makeHeartbeatService() as any,
    )
  })

  it('should pass through pearls with no trustThreshold', async () => {
    const candidates = [
      makePearlMeta({ shareConditions: null }),
    ]
    const result = await service.trustFilter('owner-1', 'friend-1', candidates)
    expect(result).toHaveLength(1)
  })

  it('should filter out pearls where trust < trustThreshold', async () => {
    ;(trustService.getComposite as ReturnType<typeof vi.fn>).mockResolvedValue(0.3)
    const candidates = [
      makePearlMeta({ shareConditions: { trustThreshold: 0.6 } }),
    ]
    const result = await service.trustFilter('owner-1', 'friend-1', candidates)
    expect(result).toHaveLength(0)
  })

  it('should keep pearls where trust >= trustThreshold', async () => {
    ;(trustService.getComposite as ReturnType<typeof vi.fn>).mockResolvedValue(0.8)
    const candidates = [
      makePearlMeta({ shareConditions: { trustThreshold: 0.7 } }),
    ]
    const result = await service.trustFilter('owner-1', 'friend-1', candidates)
    expect(result).toHaveLength(1)
  })

  it('should use first domain_tag as trust domain, fallback to _overall', async () => {
    const candidates = [
      makePearlMeta({ domainTags: ['AI'], shareConditions: { trustThreshold: 0.5 } }),
      makePearlMeta({ id: 'p2', domainTags: [], shareConditions: { trustThreshold: 0.5 } }),
    ]
    ;(trustService.getComposite as ReturnType<typeof vi.fn>).mockResolvedValue(0.8)
    await service.trustFilter('owner-1', 'friend-1', candidates)
    expect(trustService.getComposite).toHaveBeenCalledWith('owner-1', 'friend-1', 'AI')
    expect(trustService.getComposite).toHaveBeenCalledWith('owner-1', 'friend-1', '_overall')
  })
})

// ─── buildRoutingContext ──────────────────────────────────────────────────────

describe('PearlRoutingService.buildRoutingContext (T9)', () => {
  let service: PearlRoutingService
  let pearlService: ReturnType<typeof makePearlService>
  let trustService: ReturnType<typeof makeTrustService>

  beforeEach(() => {
    pearlService = makePearlService()
    trustService = makeTrustService()
    service = new PearlRoutingService(
      pearlService as any,
      makeToMService() as any,
      trustService as any,
      makeHeartbeatService() as any,
    )
  })

  it('should return null when preFilter yields no candidates', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([])
    const heartbeat = makeHeartbeat({ interests: ['AI'] })
    const result = await service.buildRoutingContext('owner-1', 'friend-1', heartbeat)
    expect(result).toBeNull()
  })

  it('should return null when trustFilter eliminates all candidates', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ domainTags: ['AI'], shareConditions: { trustThreshold: 0.9 } }),
    ])
    ;(trustService.getComposite as ReturnType<typeof vi.fn>).mockResolvedValue(0.3)
    const heartbeat = makeHeartbeat({ interests: ['AI'] })
    const result = await service.buildRoutingContext('owner-1', 'friend-1', heartbeat)
    expect(result).toBeNull()
  })

  it('should return RoutingContext with candidates and trust scores', async () => {
    pearlService.getRoutingCandidates = vi.fn().mockResolvedValue([
      makePearlMeta({ domainTags: ['AI'], shareConditions: null }),
    ])
    const heartbeat = makeHeartbeat({ interests: ['AI'] })
    const result = await service.buildRoutingContext('owner-1', 'friend-1', heartbeat)
    expect(result).not.toBeNull()
    expect(result!.friendId).toBe('friend-1')
    expect(result!.friendInterests).toContain('AI')
    expect(result!.candidates).toHaveLength(1)
  })
})

// ─── executeRoute ─────────────────────────────────────────────────────────────

describe('PearlRoutingService.executeRoute (T10)', () => {
  let service: PearlRoutingService
  let pearlService: ReturnType<typeof makePearlService>

  beforeEach(() => {
    pearlService = makePearlService()
    service = new PearlRoutingService(
      pearlService as any,
      makeToMService() as any,
      makeTrustService() as any,
      makeHeartbeatService() as any,
    )
  })

  it('should call pearlService.share with routing context', async () => {
    await service.executeRoute('owner-1', 'friend-1', 'pearl-1', ['AI'])
    expect(pearlService.share).toHaveBeenCalledWith(
      'pearl-1', 'owner-1', 'friend-1',
      expect.objectContaining({ friendInterests: ['AI'] }),
    )
  })
})

// ─── recordRoutingEvent ───────────────────────────────────────────────────────

describe('PearlRoutingService.recordRoutingEvent (T11)', () => {
  let service: PearlRoutingService

  beforeEach(() => {
    service = new PearlRoutingService(
      makePearlService() as any,
      makeToMService() as any,
      makeTrustService() as any,
      makeHeartbeatService() as any,
    )
  })

  it('should record routing event without throwing', async () => {
    await expect(
      service.recordRoutingEvent('owner-1', 'pearl-1', 'friend-1', true, 'matched')
    ).resolves.not.toThrow()
  })
})
