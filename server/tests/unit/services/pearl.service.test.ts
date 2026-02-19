/**
 * PearlService Unit Tests
 * T11-T18: create/delete/findById/findByOwner/update/share/getReceivedPearls/endorse/updateLuster/getRoutingCandidates/getPearlDomainTags
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PearlService } from '../../../src/services/pearl.service.js'
import type { IPearlRepository, IPearlEndorsementRepository, PearlMetadataRecord, PearlContentRecord, PearlFullRecord, PearlReferenceRecord } from '../../../src/db/repositories/interfaces/pearl.repository.interface.js'
import type { EventBus } from '../../../src/services/event-bus.js'
import type { FriendshipService } from '../../../src/services/friendship.service.js'

// ─── Mock factories ─────────────────────────────────────────────────────────

const makePearlMeta = (overrides: Partial<PearlMetadataRecord> = {}): PearlMetadataRecord => ({
  id: 'pearl-1',
  ownerId: 'owner-1',
  type: 'insight',
  triggerText: 'test trigger',
  domainTags: ['AI'],
  luster: 0.5,
  shareability: 'friends_only',
  shareConditions: null,
  createdAt: '2026-02-19T00:00:00Z',
  updatedAt: '2026-02-19T00:00:00Z',
  ...overrides,
})

const makePearlContent = (overrides: Partial<PearlContentRecord> = {}): PearlContentRecord => ({
  ...makePearlMeta(),
  body: null,
  context: null,
  originType: 'manual',
  ...overrides,
})

function makePearlRepo(overrides: Partial<IPearlRepository> = {}): IPearlRepository {
  return {
    create: vi.fn().mockResolvedValue(makePearlContent()),
    findById: vi.fn().mockResolvedValue(makePearlContent()),
    findByOwner: vi.fn().mockResolvedValue([makePearlMeta()]),
    update: vi.fn().mockResolvedValue(makePearlContent()),
    updateLuster: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getPearlDomainTags: vi.fn().mockResolvedValue(['AI']),
    getRoutingCandidates: vi.fn().mockResolvedValue([makePearlMeta()]),
    isVisibleTo: vi.fn().mockResolvedValue(true),
    addReference: vi.fn().mockResolvedValue({} as PearlReferenceRecord),
    removeReference: vi.fn().mockResolvedValue(undefined),
    getReferences: vi.fn().mockResolvedValue([]),
    createShare: vi.fn().mockResolvedValue(undefined),
    getReceivedPearls: vi.fn().mockResolvedValue([]),
    hasBeenSharedWith: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
}

function makeEndorsementRepo(overrides: Partial<IPearlEndorsementRepository> = {}): IPearlEndorsementRepository {
  return {
    upsert: vi.fn().mockResolvedValue({
      id: 'end-1', pearlId: 'pearl-1', endorserClawId: 'endorser-1',
      score: 0.8, comment: null, createdAt: '2026-02-19T', updatedAt: '2026-02-19T',
    }),
    findByPearl: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    getScores: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function makeFriendshipService(areFriends = true): Pick<FriendshipService, 'areFriends'> {
  return {
    areFriends: vi.fn().mockResolvedValue(areFriends),
  } as unknown as Pick<FriendshipService, 'areFriends'>
}

function makeEventBus(): EventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as EventBus
}

describe('PearlService', () => {
  let pearlRepo: IPearlRepository
  let endorsementRepo: IPearlEndorsementRepository
  let friendshipService: any
  let eventBus: EventBus
  let service: PearlService

  beforeEach(() => {
    pearlRepo = makePearlRepo()
    endorsementRepo = makeEndorsementRepo()
    friendshipService = makeFriendshipService()
    eventBus = makeEventBus()
    service = new PearlService(pearlRepo, endorsementRepo, friendshipService, eventBus)
  })

  // ─── T11: create + delete ────────────────────────────────────────────────
  describe('create', () => {
    it('should create a pearl and emit pearl.created event', async () => {
      const result = await service.create('owner-1', {
        type: 'insight',
        triggerText: 'test trigger',
        domainTags: ['AI'],
      })
      expect(pearlRepo.create).toHaveBeenCalledOnce()
      expect(eventBus.emit).toHaveBeenCalledWith('pearl.created', expect.objectContaining({
        ownerId: 'owner-1',
        domainTags: expect.any(Array),
      }))
      expect(result.ownerId).toBe('owner-1')
    })

    it('should use default shareability friends_only', async () => {
      await service.create('owner-1', { type: 'insight', triggerText: 'test' })
      expect(pearlRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        shareability: 'friends_only',
        originType: 'manual',
      }))
    })

    it('should set originType to manual always', async () => {
      await service.create('owner-1', { type: 'insight', triggerText: 'test' })
      expect(pearlRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        originType: 'manual',
      }))
    })
  })

  describe('delete', () => {
    it('should delete pearl when requester is owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlMeta({ ownerId: 'owner-1' }))
      await service.delete('pearl-1', 'owner-1')
      expect(pearlRepo.delete).toHaveBeenCalledWith('pearl-1')
    })

    it('should throw NOT_FOUND when pearl does not exist', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(null)
      await expect(service.delete('non-existent', 'owner-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('should throw FORBIDDEN when requester is not owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlMeta({ ownerId: 'owner-1' }))
      await expect(service.delete('pearl-1', 'other-user')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  // ─── T12: findById ───────────────────────────────────────────────────────
  describe('findById', () => {
    it('should delegate to repository', async () => {
      await service.findById('pearl-1', 1)
      expect(pearlRepo.findById).toHaveBeenCalledWith('pearl-1', 1)
    })

    it('should return null for non-existent pearl', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(null)
      const result = await service.findById('non-existent', 1)
      expect(result).toBeNull()
    })
  })

  // ─── T13: findByOwner ────────────────────────────────────────────────────
  describe('findByOwner', () => {
    it('should delegate to repository with filters', async () => {
      const filters = { type: 'insight' as const, limit: 10 }
      await service.findByOwner('owner-1', filters)
      expect(pearlRepo.findByOwner).toHaveBeenCalledWith('owner-1', filters)
    })
  })

  // ─── T14: update ─────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update pearl when requester is owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlContent({ ownerId: 'owner-1' }))
      await service.update('pearl-1', 'owner-1', { triggerText: 'new trigger' })
      expect(pearlRepo.update).toHaveBeenCalledWith('pearl-1', { triggerText: 'new trigger' })
    })

    it('should throw FORBIDDEN when requester is not owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlContent({ ownerId: 'owner-1' }))
      await expect(service.update('pearl-1', 'other-user', {})).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should throw NOT_FOUND when pearl does not exist', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(null)
      await expect(service.update('non-existent', 'owner-1', {})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  // ─── T15: share ──────────────────────────────────────────────────────────
  describe('share', () => {
    it('should create share and emit pearl.shared event', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(
        makePearlContent({ ownerId: 'owner-1', shareability: 'friends_only' }),
      )
      pearlRepo.hasBeenSharedWith = vi.fn().mockResolvedValue(false)

      await service.share('pearl-1', 'owner-1', 'friend-1')

      expect(pearlRepo.createShare).toHaveBeenCalledOnce()
      expect(eventBus.emit).toHaveBeenCalledWith('pearl.shared', expect.objectContaining({
        fromClawId: 'owner-1',
        toClawId: 'friend-1',
        pearlId: 'pearl-1',
      }))
    })

    it('should throw NOT_FOUND when pearl does not exist', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(null)
      await expect(service.share('non-existent', 'owner-1', 'friend-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('should throw FORBIDDEN when requester is not owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(
        makePearlContent({ ownerId: 'owner-1' }),
      )
      await expect(service.share('pearl-1', 'not-owner', 'friend-1')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should throw PRIVATE when pearl shareability is private', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(
        makePearlContent({ ownerId: 'owner-1', shareability: 'private' }),
      )
      await expect(service.share('pearl-1', 'owner-1', 'friend-1')).rejects.toMatchObject({
        code: 'PRIVATE',
      })
    })

    it('should throw NOT_FRIENDS when toClawId is not a friend', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(
        makePearlContent({ ownerId: 'owner-1', shareability: 'friends_only' }),
      )
      friendshipService.areFriends = vi.fn().mockResolvedValue(false)
      await expect(service.share('pearl-1', 'owner-1', 'stranger')).rejects.toMatchObject({
        code: 'NOT_FRIENDS',
      })
    })

    it('should be idempotent (already shared → no event, no duplicate)', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(
        makePearlContent({ ownerId: 'owner-1', shareability: 'friends_only' }),
      )
      pearlRepo.hasBeenSharedWith = vi.fn().mockResolvedValue(true) // already shared

      await service.share('pearl-1', 'owner-1', 'friend-1')

      expect(pearlRepo.createShare).not.toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalled()
    })
  })

  // ─── T16: getReceivedPearls ──────────────────────────────────────────────
  describe('getReceivedPearls', () => {
    it('should delegate to repository', async () => {
      await service.getReceivedPearls('claw-1', { limit: 10 })
      expect(pearlRepo.getReceivedPearls).toHaveBeenCalledWith('claw-1', { limit: 10 })
    })
  })

  // ─── T17: endorse + updateLuster ────────────────────────────────────────
  describe('endorse', () => {
    it('should endorse pearl and emit pearl.endorsed event', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlMeta({ ownerId: 'owner-1' }))
      pearlRepo.isVisibleTo = vi.fn().mockResolvedValue(true)
      endorsementRepo.getScores = vi.fn().mockResolvedValue([0.8])

      const result = await service.endorse('pearl-1', 'endorser-1', 0.8, 'great')

      expect(endorsementRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        pearlId: 'pearl-1',
        endorserClawId: 'endorser-1',
        score: 0.8,
        comment: 'great',
      }))
      expect(pearlRepo.updateLuster).toHaveBeenCalledOnce()
      expect(eventBus.emit).toHaveBeenCalledWith('pearl.endorsed', expect.objectContaining({
        pearlId: 'pearl-1',
        endorserClawId: 'endorser-1',
        score: 0.8,
      }))
      expect(result).toBeDefined()
    })

    it('should throw NOT_FOUND when pearl does not exist', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(null)
      await expect(service.endorse('non-existent', 'endorser-1', 0.8)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('should throw SELF_ENDORSE when endorser is owner', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlMeta({ ownerId: 'owner-1' }))
      await expect(service.endorse('pearl-1', 'owner-1', 0.8)).rejects.toMatchObject({
        code: 'SELF_ENDORSE',
      })
    })

    it('should throw FORBIDDEN when endorser cannot see pearl', async () => {
      pearlRepo.findById = vi.fn().mockResolvedValue(makePearlMeta({ ownerId: 'owner-1' }))
      pearlRepo.isVisibleTo = vi.fn().mockResolvedValue(false)
      await expect(service.endorse('pearl-1', 'endorser-1', 0.8)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('updateLuster', () => {
    it('should compute luster from scores and persist', async () => {
      endorsementRepo.getScores = vi.fn().mockResolvedValue([0.9])
      await service.updateLuster('pearl-1')
      // (0.5 + 0.9) / 2 = 0.70
      expect(pearlRepo.updateLuster).toHaveBeenCalledWith('pearl-1', expect.closeTo(0.7, 5))
    })

    it('should use 0.5 when no endorsements', async () => {
      endorsementRepo.getScores = vi.fn().mockResolvedValue([])
      await service.updateLuster('pearl-1')
      expect(pearlRepo.updateLuster).toHaveBeenCalledWith('pearl-1', 0.5)
    })
  })

  // ─── T18: getRoutingCandidates + getPearlDomainTags ─────────────────────
  describe('getRoutingCandidates', () => {
    it('should delegate to repository', async () => {
      await service.getRoutingCandidates('claw-1')
      expect(pearlRepo.getRoutingCandidates).toHaveBeenCalledWith('claw-1')
    })
  })

  describe('getPearlDomainTags', () => {
    it('should delegate to repository with optional since date', async () => {
      const since = new Date('2026-01-01')
      await service.getPearlDomainTags('owner-1', since)
      expect(pearlRepo.getPearlDomainTags).toHaveBeenCalledWith('owner-1', since)
    })

    it('should work without since date', async () => {
      await service.getPearlDomainTags('owner-1')
      expect(pearlRepo.getPearlDomainTags).toHaveBeenCalledWith('owner-1', undefined)
    })
  })
})
