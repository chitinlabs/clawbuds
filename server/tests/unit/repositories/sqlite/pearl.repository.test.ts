/**
 * SQLite PearlRepository Unit Tests
 * 覆盖全方法：create / findById (level 0/1/2) / findByOwner / update / updateLuster /
 *             delete / getPearlDomainTags / getRoutingCandidates / isVisibleTo /
 *             addReference / removeReference / getReferences /
 *             createShare / getReceivedPearls / hasBeenSharedWith
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLitePearlRepository } from '../../../../src/db/repositories/sqlite/pearl.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import { randomUUID } from 'node:crypto'

describe('SQLitePearlRepository', () => {
  let db: Database.Database
  let repo: SQLitePearlRepository
  let clawRepo: SQLiteClawRepository
  let ownerClawId: string
  let otherClawId: string

  const makeCreateData = (overrides: Partial<{
    id: string
    ownerId: string
    type: 'insight' | 'framework' | 'experience'
    triggerText: string
    domainTags: string[]
    shareability: 'private' | 'friends_only' | 'public'
    shareConditions: Record<string, unknown> | null
    body: string | null
    context: string | null
    originType: 'manual' | 'conversation' | 'observation'
  }> = {}) => ({
    id: randomUUID(),
    ownerId: ownerClawId,
    type: 'insight' as const,
    triggerText: 'test trigger',
    domainTags: ['AI', 'design'],
    shareability: 'friends_only' as const,
    shareConditions: null,
    body: null,
    context: null,
    originType: 'manual' as const,
    ...overrides,
  })

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLitePearlRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const owner = await clawRepo.register({ publicKey: 'pk-owner', displayName: 'Owner' })
    const other = await clawRepo.register({ publicKey: 'pk-other', displayName: 'Other' })
    ownerClawId = owner.clawId
    otherClawId = other.clawId
  })

  afterEach(() => {
    db.close()
  })

  // ─── create ─────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a pearl with all fields', async () => {
      const data = makeCreateData({ body: 'test body', context: 'test context' })
      const result = await repo.create(data)

      expect(result.id).toBe(data.id)
      expect(result.ownerId).toBe(ownerClawId)
      expect(result.type).toBe('insight')
      expect(result.triggerText).toBe('test trigger')
      expect(result.domainTags).toEqual(['AI', 'design'])
      expect(result.luster).toBe(0.5)
      expect(result.shareability).toBe('friends_only')
      expect(result.shareConditions).toBeNull()
      expect(result.body).toBe('test body')
      expect(result.context).toBe('test context')
      expect(result.originType).toBe('manual')
      expect(result.createdAt).toBeTruthy()
      expect(result.updatedAt).toBeTruthy()
    })

    it('should create pearl with null body and context', async () => {
      const data = makeCreateData()
      const result = await repo.create(data)
      expect(result.body).toBeNull()
      expect(result.context).toBeNull()
    })

    it('should create pearl with shareConditions JSON', async () => {
      const conditions = { trustThreshold: 0.7, domainMatch: true }
      const data = makeCreateData({ shareConditions: conditions })
      const result = await repo.create(data)
      expect(result.shareConditions).toEqual(conditions)
    })

    it('should create pearl with empty domainTags array', async () => {
      const data = makeCreateData({ domainTags: [] })
      const result = await repo.create(data)
      expect(result.domainTags).toEqual([])
    })
  })

  // ─── findById ───────────────────────────────────────────────────────────
  describe('findById', () => {
    let pearlId: string

    beforeEach(async () => {
      const data = makeCreateData({ body: 'test body', context: 'test ctx' })
      pearlId = data.id
      await repo.create(data)
    })

    it('should return null for non-existent pearl', async () => {
      const result = await repo.findById('non-existent', 1)
      expect(result).toBeNull()
    })

    it('level=0 should return only metadata fields', async () => {
      const result = await repo.findById(pearlId, 0)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(pearlId)
      expect(result!.triggerText).toBe('test trigger')
      expect(result!.domainTags).toEqual(['AI', 'design'])
      expect(result!.luster).toBe(0.5)
      // Level 0 should NOT include body/context/originType
      expect((result as any).body).toBeUndefined()
      expect((result as any).context).toBeUndefined()
      expect((result as any).originType).toBeUndefined()
    })

    it('level=1 should return content fields including body', async () => {
      const result = await repo.findById(pearlId, 1)
      expect(result).not.toBeNull()
      expect((result as any).body).toBe('test body')
      expect((result as any).context).toBe('test ctx')
      expect((result as any).originType).toBe('manual')
      // Should NOT include references
      expect((result as any).references).toBeUndefined()
    })

    it('level=2 should return content fields plus references array', async () => {
      const result = await repo.findById(pearlId, 2)
      expect(result).not.toBeNull()
      expect((result as any).body).toBe('test body')
      expect((result as any).references).toBeDefined()
      expect(Array.isArray((result as any).references)).toBe(true)
      expect((result as any).references).toHaveLength(0)
    })

    it('level=2 should include references when they exist', async () => {
      await repo.addReference(pearlId, { type: 'source', content: 'https://example.com' })
      const result = await repo.findById(pearlId, 2) as any
      expect(result!.references).toHaveLength(1)
      expect(result!.references[0].content).toBe('https://example.com')
    })
  })

  // ─── findByOwner ────────────────────────────────────────────────────────
  describe('findByOwner', () => {
    it('should return empty array when owner has no pearls', async () => {
      const result = await repo.findByOwner(ownerClawId)
      expect(result).toEqual([])
    })

    it('should return owner\'s pearls in Level 0 format', async () => {
      await repo.create(makeCreateData({ type: 'insight', domainTags: ['AI'] }))
      await repo.create(makeCreateData({ type: 'framework', domainTags: ['UX'] }))

      const result = await repo.findByOwner(ownerClawId)
      expect(result).toHaveLength(2)
      // Verify Level 0 (no body field)
      expect((result[0] as any).body).toBeUndefined()
    })

    it('should not return other user\'s pearls', async () => {
      await repo.create(makeCreateData({ ownerId: otherClawId }))
      const result = await repo.findByOwner(ownerClawId)
      expect(result).toHaveLength(0)
    })

    it('should filter by type', async () => {
      await repo.create(makeCreateData({ type: 'insight' }))
      await repo.create(makeCreateData({ type: 'framework' }))

      const result = await repo.findByOwner(ownerClawId, { type: 'insight' })
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('insight')
    })

    it('should filter by domain', async () => {
      await repo.create(makeCreateData({ domainTags: ['AI', 'LLM'] }))
      await repo.create(makeCreateData({ domainTags: ['UX'] }))

      const resultAI = await repo.findByOwner(ownerClawId, { domain: 'AI' })
      expect(resultAI).toHaveLength(1)
    })

    it('should filter by shareability', async () => {
      await repo.create(makeCreateData({ shareability: 'private' }))
      await repo.create(makeCreateData({ shareability: 'public' }))

      const result = await repo.findByOwner(ownerClawId, { shareability: 'private' })
      expect(result).toHaveLength(1)
    })

    it('should respect limit and offset', async () => {
      await repo.create(makeCreateData())
      await repo.create(makeCreateData())
      await repo.create(makeCreateData())

      const result = await repo.findByOwner(ownerClawId, { limit: 2, offset: 1 })
      expect(result).toHaveLength(2)
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update allowed fields', async () => {
      const data = makeCreateData({ body: 'original body' })
      await repo.create(data)

      const updated = await repo.update(data.id, {
        triggerText: 'new trigger',
        body: 'updated body',
        domainTags: ['new-tag'],
        shareability: 'public',
      })

      expect(updated.triggerText).toBe('new trigger')
      expect(updated.body).toBe('updated body')
      expect(updated.domainTags).toEqual(['new-tag'])
      expect(updated.shareability).toBe('public')
    })

    it('should allow clearing body to null', async () => {
      const data = makeCreateData({ body: 'some body' })
      await repo.create(data)

      const updated = await repo.update(data.id, { body: null })
      expect(updated.body).toBeNull()
    })

    it('should update the updatedAt timestamp', async () => {
      const data = makeCreateData()
      await repo.create(data)

      const before = await repo.findById(data.id, 1) as any
      // Wait 1ms to ensure different timestamp
      await new Promise(r => setTimeout(r, 1))
      await repo.update(data.id, { triggerText: 'updated' })
      const after = await repo.findById(data.id, 1) as any
      expect(after.updatedAt >= before.updatedAt).toBe(true)
    })
  })

  // ─── updateLuster ────────────────────────────────────────────────────────
  describe('updateLuster', () => {
    it('should update the luster value', async () => {
      const data = makeCreateData()
      await repo.create(data)

      await repo.updateLuster(data.id, 0.8)
      const result = await repo.findById(data.id, 0)
      expect(result!.luster).toBe(0.8)
    })
  })

  // ─── delete ─────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('should delete a pearl', async () => {
      const data = makeCreateData()
      await repo.create(data)

      await repo.delete(data.id)
      const result = await repo.findById(data.id, 1)
      expect(result).toBeNull()
    })

    it('should cascade delete references', async () => {
      const data = makeCreateData()
      await repo.create(data)
      await repo.addReference(data.id, { type: 'source', content: 'https://example.com' })

      await repo.delete(data.id)
      const refs = await repo.getReferences(data.id)
      expect(refs).toHaveLength(0)
    })
  })

  // ─── getPearlDomainTags ──────────────────────────────────────────────────
  describe('getPearlDomainTags', () => {
    it('should return all domain tags for owner', async () => {
      await repo.create(makeCreateData({ domainTags: ['AI', 'design'] }))
      await repo.create(makeCreateData({ domainTags: ['startup', 'AI'] }))

      const tags = await repo.getPearlDomainTags(ownerClawId)
      expect(tags).toContain('AI')
      expect(tags).toContain('design')
      expect(tags).toContain('startup')
      // Should be deduplicated
      expect(tags.filter(t => t === 'AI')).toHaveLength(1)
    })

    it('should return empty array when no pearls', async () => {
      const tags = await repo.getPearlDomainTags(ownerClawId)
      expect(tags).toEqual([])
    })

    it('should filter by since date and include recently created pearls', async () => {
      // Pearl created just now → within the 30-day window
      await repo.create(makeCreateData({ domainTags: ['AI', 'design'] }))

      // since = 30 days ago
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const tags = await repo.getPearlDomainTags(ownerClawId, since)
      expect(tags).toContain('AI')
      expect(tags).toContain('design')
    })

    it('should not return tags from other owner', async () => {
      await repo.create(makeCreateData({ ownerId: otherClawId, domainTags: ['other-tag'] }))
      const tags = await repo.getPearlDomainTags(ownerClawId)
      expect(tags).not.toContain('other-tag')
    })
  })

  // ─── getRoutingCandidates ────────────────────────────────────────────────
  describe('getRoutingCandidates', () => {
    it('should return only non-private pearls', async () => {
      await repo.create(makeCreateData({ shareability: 'private' }))
      await repo.create(makeCreateData({ shareability: 'friends_only' }))
      await repo.create(makeCreateData({ shareability: 'public' }))

      const candidates = await repo.getRoutingCandidates(ownerClawId)
      expect(candidates).toHaveLength(2)
      expect(candidates.every(c => c.shareability !== 'private')).toBe(true)
    })

    it('should return Level 0 only (no body)', async () => {
      await repo.create(makeCreateData({ body: 'body content', shareability: 'public' }))
      const candidates = await repo.getRoutingCandidates(ownerClawId)
      expect((candidates[0] as any).body).toBeUndefined()
    })
  })

  // ─── isVisibleTo ─────────────────────────────────────────────────────────
  describe('isVisibleTo', () => {
    it('owner can always see their own pearl', async () => {
      const data = makeCreateData({ shareability: 'private' })
      await repo.create(data)
      const visible = await repo.isVisibleTo(data.id, ownerClawId)
      expect(visible).toBe(true)
    })

    it('public pearl is visible to anyone', async () => {
      const data = makeCreateData({ shareability: 'public' })
      await repo.create(data)
      const visible = await repo.isVisibleTo(data.id, otherClawId)
      expect(visible).toBe(true)
    })

    it('private pearl is NOT visible to non-owner', async () => {
      const data = makeCreateData({ shareability: 'private' })
      await repo.create(data)
      const visible = await repo.isVisibleTo(data.id, otherClawId)
      expect(visible).toBe(false)
    })

    it('friends_only pearl is visible after share', async () => {
      const data = makeCreateData({ shareability: 'friends_only' })
      await repo.create(data)
      // Not shared yet
      expect(await repo.isVisibleTo(data.id, otherClawId)).toBe(false)
      // Share it
      await repo.createShare({
        id: randomUUID(),
        pearlId: data.id,
        fromClawId: ownerClawId,
        toClawId: otherClawId,
      })
      expect(await repo.isVisibleTo(data.id, otherClawId)).toBe(true)
    })
  })

  // ─── pearl_references ────────────────────────────────────────────────────
  describe('pearl_references', () => {
    let pearlId: string

    beforeEach(async () => {
      const data = makeCreateData()
      pearlId = data.id
      await repo.create(data)
    })

    it('addReference should create a reference record', async () => {
      const ref = await repo.addReference(pearlId, {
        type: 'source',
        content: 'https://example.com',
      })
      expect(ref.id).toBeTruthy()
      expect(ref.pearlId).toBe(pearlId)
      expect(ref.type).toBe('source')
      expect(ref.content).toBe('https://example.com')
      expect(ref.createdAt).toBeTruthy()
    })

    it('getReferences should return all references', async () => {
      await repo.addReference(pearlId, { type: 'source', content: 'https://a.com' })
      await repo.addReference(pearlId, { type: 'related_pearl', content: 'other-pearl-id' })

      const refs = await repo.getReferences(pearlId)
      expect(refs).toHaveLength(2)
    })

    it('removeReference should delete a reference', async () => {
      const ref = await repo.addReference(pearlId, { type: 'source', content: 'https://x.com' })
      await repo.removeReference(ref.id)

      const refs = await repo.getReferences(pearlId)
      expect(refs).toHaveLength(0)
    })
  })

  // ─── pearl_shares ─────────────────────────────────────────────────────────
  describe('pearl_shares', () => {
    let pearlId: string

    beforeEach(async () => {
      const data = makeCreateData()
      pearlId = data.id
      await repo.create(data)
    })

    it('createShare should create a share record', async () => {
      await repo.createShare({
        id: randomUUID(),
        pearlId,
        fromClawId: ownerClawId,
        toClawId: otherClawId,
      })
      const visible = await repo.hasBeenSharedWith(pearlId, otherClawId)
      expect(visible).toBe(true)
    })

    it('createShare should be idempotent (no error on duplicate)', async () => {
      const shareData = {
        id: randomUUID(),
        pearlId,
        fromClawId: ownerClawId,
        toClawId: otherClawId,
      }
      await repo.createShare(shareData)
      // Second call with same combination should not throw
      await expect(repo.createShare({ ...shareData, id: randomUUID() })).resolves.not.toThrow()
    })

    it('hasBeenSharedWith should return false when not shared', async () => {
      const result = await repo.hasBeenSharedWith(pearlId, otherClawId)
      expect(result).toBe(false)
    })

    it('getReceivedPearls should return pearls shared to toClawId', async () => {
      await repo.createShare({
        id: randomUUID(),
        pearlId,
        fromClawId: ownerClawId,
        toClawId: otherClawId,
      })

      const received = await repo.getReceivedPearls(otherClawId)
      expect(received).toHaveLength(1)
      expect(received[0].share.fromClawId).toBe(ownerClawId)
      expect(received[0].pearl.id).toBe(pearlId)
    })

    it('getReceivedPearls returns Level 0 pearl data', async () => {
      const data = makeCreateData({ body: 'secret body' })
      await repo.create(data)
      await repo.createShare({
        id: randomUUID(),
        pearlId: data.id,
        fromClawId: ownerClawId,
        toClawId: otherClawId,
      })

      const received = await repo.getReceivedPearls(otherClawId)
      const sharedPearl = received.find(r => r.pearl.id === data.id)
      expect(sharedPearl).toBeDefined()
      expect((sharedPearl!.pearl as any).body).toBeUndefined()
    })

    it('getReceivedPearls should respect limit and offset', async () => {
      // Create 3 more claws for multi-pearl test
      const c = await clawRepo.register({ publicKey: 'pk-c', displayName: 'C' })
      const d = await clawRepo.register({ publicKey: 'pk-d', displayName: 'D' })
      const e = await clawRepo.register({ publicKey: 'pk-e', displayName: 'E' })

      for (const p of [c, d, e]) {
        const pearl = makeCreateData({ ownerId: ownerClawId })
        await repo.create(pearl)
        await repo.createShare({
          id: randomUUID(),
          pearlId: pearl.id,
          fromClawId: ownerClawId,
          toClawId: otherClawId,
        })
        void p // suppress unused
      }

      const page1 = await repo.getReceivedPearls(otherClawId, { limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)
    })
  })
})
