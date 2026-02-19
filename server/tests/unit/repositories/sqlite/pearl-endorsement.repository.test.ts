/**
 * SQLite PearlEndorsementRepository Unit Tests
 * 覆盖 upsert / findByPearl / findOne / getScores
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLitePearlEndorsementRepository } from '../../../../src/db/repositories/sqlite/pearl-endorsement.repository.js'
import { SQLitePearlRepository } from '../../../../src/db/repositories/sqlite/pearl.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import { randomUUID } from 'node:crypto'

describe('SQLitePearlEndorsementRepository', () => {
  let db: Database.Database
  let repo: SQLitePearlEndorsementRepository
  let pearlRepo: SQLitePearlRepository
  let clawRepo: SQLiteClawRepository
  let pearlId: string
  let ownerClawId: string
  let endorserClawId: string
  let endorser2ClawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLitePearlEndorsementRepository(db)
    pearlRepo = new SQLitePearlRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const owner = await clawRepo.register({ publicKey: 'pk-owner', displayName: 'Owner' })
    const endorser = await clawRepo.register({ publicKey: 'pk-endorser', displayName: 'Endorser' })
    const endorser2 = await clawRepo.register({ publicKey: 'pk-endorser2', displayName: 'Endorser2' })
    ownerClawId = owner.clawId
    endorserClawId = endorser.clawId
    endorser2ClawId = endorser2.clawId

    pearlId = randomUUID()
    await pearlRepo.create({
      id: pearlId,
      ownerId: ownerClawId,
      type: 'insight',
      triggerText: 'test pearl',
      domainTags: ['AI'],
      shareability: 'public',
      shareConditions: null,
      body: null,
      context: null,
      originType: 'manual',
    })
  })

  afterEach(() => {
    db.close()
  })

  // ─── upsert ─────────────────────────────────────────────────────────────
  describe('upsert', () => {
    it('should create a new endorsement', async () => {
      const result = await repo.upsert({
        id: randomUUID(),
        pearlId,
        endorserClawId,
        score: 0.8,
        comment: 'great insight',
      })

      expect(result.pearlId).toBe(pearlId)
      expect(result.endorserClawId).toBe(endorserClawId)
      expect(result.score).toBe(0.8)
      expect(result.comment).toBe('great insight')
      expect(result.createdAt).toBeTruthy()
      expect(result.updatedAt).toBeTruthy()
    })

    it('should update existing endorsement (upsert idempotent by endorser)', async () => {
      await repo.upsert({
        id: randomUUID(),
        pearlId,
        endorserClawId,
        score: 0.6,
      })

      const updated = await repo.upsert({
        id: randomUUID(),
        pearlId,
        endorserClawId,
        score: 0.9,
        comment: 'updated comment',
      })

      expect(updated.score).toBe(0.9)
      expect(updated.comment).toBe('updated comment')

      // Verify only one endorsement exists
      const all = await repo.findByPearl(pearlId)
      expect(all).toHaveLength(1)
    })

    it('should create without comment (comment is optional)', async () => {
      const result = await repo.upsert({
        id: randomUUID(),
        pearlId,
        endorserClawId,
        score: 0.7,
      })
      expect(result.comment).toBeNull()
    })
  })

  // ─── findByPearl ─────────────────────────────────────────────────────────
  describe('findByPearl', () => {
    it('should return empty array when no endorsements', async () => {
      const result = await repo.findByPearl(pearlId)
      expect(result).toEqual([])
    })

    it('should return all endorsements for a pearl', async () => {
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId, score: 0.8 })
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId: endorser2ClawId, score: 0.7 })

      const result = await repo.findByPearl(pearlId)
      expect(result).toHaveLength(2)
    })

    it('should not return endorsements for different pearl', async () => {
      const otherPearlId = randomUUID()
      await pearlRepo.create({
        id: otherPearlId,
        ownerId: ownerClawId,
        type: 'framework',
        triggerText: 'other pearl',
        domainTags: [],
        shareability: 'public',
        shareConditions: null,
        body: null,
        context: null,
        originType: 'manual',
      })
      await repo.upsert({ id: randomUUID(), pearlId: otherPearlId, endorserClawId, score: 0.5 })

      const result = await repo.findByPearl(pearlId)
      expect(result).toHaveLength(0)
    })
  })

  // ─── findOne ─────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return null when endorsement does not exist', async () => {
      const result = await repo.findOne(pearlId, endorserClawId)
      expect(result).toBeNull()
    })

    it('should return the endorsement when it exists', async () => {
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId, score: 0.8 })
      const result = await repo.findOne(pearlId, endorserClawId)
      expect(result).not.toBeNull()
      expect(result!.pearlId).toBe(pearlId)
      expect(result!.endorserClawId).toBe(endorserClawId)
      expect(result!.score).toBe(0.8)
    })
  })

  // ─── getScores ───────────────────────────────────────────────────────────
  describe('getScores', () => {
    it('should return empty array when no endorsements', async () => {
      const scores = await repo.getScores(pearlId)
      expect(scores).toEqual([])
    })

    it('should return all score values for a pearl', async () => {
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId, score: 0.8 })
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId: endorser2ClawId, score: 0.6 })

      const scores = await repo.getScores(pearlId)
      expect(scores).toHaveLength(2)
      expect(scores).toContain(0.8)
      expect(scores).toContain(0.6)
    })

    it('should return updated score after upsert', async () => {
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId, score: 0.5 })
      await repo.upsert({ id: randomUUID(), pearlId, endorserClawId, score: 0.9 }) // update

      const scores = await repo.getScores(pearlId)
      expect(scores).toHaveLength(1)
      expect(scores[0]).toBe(0.9)
    })
  })
})
