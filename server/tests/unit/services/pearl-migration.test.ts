/**
 * Phase 9 T5: Pearl Luster 一次性迁移重算测试
 * 验证 PearlService.recalculateAllLuster() 对所有 Pearl 执行信任加权版 Luster 重算
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PearlService } from '../../../src/services/pearl.service.js'
import type { IPearlRepository, IPearlEndorsementRepository } from '../../../src/db/repositories/interfaces/pearl.repository.interface.js'
import type { IThreadContributionRepository } from '../../../src/db/repositories/interfaces/thread.repository.interface.js'
import type { EventBus } from '../../../src/services/event-bus.js'
import type { FriendshipService } from '../../../src/services/friendship.service.js'
import type { TrustService } from '../../../src/services/trust.service.js'

function makeMinimalPearlRepo(allIds: string[] = []): IPearlRepository {
  return {
    findAllIds: vi.fn().mockResolvedValue(allIds),
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      id: 'pearl-1',
      ownerId: 'owner-1',
      type: 'insight',
      triggerText: 'test',
      domainTags: ['AI'],
      luster: 0.5,
      shareability: 'friends_only',
      shareConditions: null,
      createdAt: '2026-02-21T',
      updatedAt: '2026-02-21T',
    }),
    findByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateLuster: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    getPearlDomainTags: vi.fn().mockResolvedValue([]),
    getRoutingCandidates: vi.fn().mockResolvedValue([]),
    isVisibleTo: vi.fn().mockResolvedValue(true),
    addReference: vi.fn(),
    removeReference: vi.fn(),
    getReferences: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    getReceivedPearls: vi.fn().mockResolvedValue([]),
    hasBeenSharedWith: vi.fn().mockResolvedValue(false),
  } as unknown as IPearlRepository
}

function makeMinimalEndorsementRepo(): IPearlEndorsementRepository {
  return {
    upsert: vi.fn(),
    findByPearl: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    getScores: vi.fn().mockResolvedValue([]),
  }
}

function makeEventBus(): EventBus {
  return { emit: vi.fn(), on: vi.fn(), off: vi.fn(), removeAllListeners: vi.fn() } as unknown as EventBus
}

describe('PearlService.recalculateAllLuster (Phase 9 migration)', () => {
  let pearlRepo: IPearlRepository
  let endorsementRepo: IPearlEndorsementRepository
  let threadContribRepo: IThreadContributionRepository
  let trustService: TrustService
  let service: PearlService

  beforeEach(() => {
    threadContribRepo = {
      create: vi.fn(),
      findByThread: vi.fn().mockResolvedValue([]),
      countByThread: vi.fn().mockResolvedValue(0),
      countByPearlRef: vi.fn().mockResolvedValue(0),
      findByContributor: vi.fn().mockResolvedValue([]),
    } as unknown as IThreadContributionRepository

    trustService = {
      getComposite: vi.fn().mockResolvedValue(0.7),
    } as unknown as TrustService
  })

  it('should call updateLuster for each pearl found by findAllIds', async () => {
    pearlRepo = makeMinimalPearlRepo(['pearl-1', 'pearl-2', 'pearl-3'])
    endorsementRepo = makeMinimalEndorsementRepo()
    service = new PearlService(pearlRepo, endorsementRepo, {} as FriendshipService, makeEventBus(), trustService, threadContribRepo)

    await service.recalculateAllLuster()

    expect(pearlRepo.findAllIds).toHaveBeenCalledOnce()
    expect(pearlRepo.updateLuster).toHaveBeenCalledTimes(3)
    expect(pearlRepo.updateLuster).toHaveBeenCalledWith('pearl-1', expect.any(Number))
    expect(pearlRepo.updateLuster).toHaveBeenCalledWith('pearl-2', expect.any(Number))
    expect(pearlRepo.updateLuster).toHaveBeenCalledWith('pearl-3', expect.any(Number))
  })

  it('should do nothing when no pearls exist', async () => {
    pearlRepo = makeMinimalPearlRepo([])
    endorsementRepo = makeMinimalEndorsementRepo()
    service = new PearlService(pearlRepo, endorsementRepo, {} as FriendshipService, makeEventBus(), trustService, threadContribRepo)

    await service.recalculateAllLuster()

    expect(pearlRepo.findAllIds).toHaveBeenCalledOnce()
    expect(pearlRepo.updateLuster).not.toHaveBeenCalled()
  })

  it('should return count of recalculated pearls', async () => {
    pearlRepo = makeMinimalPearlRepo(['pearl-a', 'pearl-b'])
    endorsementRepo = makeMinimalEndorsementRepo()
    service = new PearlService(pearlRepo, endorsementRepo, {} as FriendshipService, makeEventBus(), trustService, threadContribRepo)

    const count = await service.recalculateAllLuster()

    expect(count).toBe(2)
  })
})
