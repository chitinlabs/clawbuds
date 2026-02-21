/**
 * SQLite ThreadRepository + ThreadContributionRepository + ThreadKeyRepository Unit Tests
 * 覆盖 IThreadRepository / IThreadContributionRepository / IThreadKeyRepository 全方法
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteThreadRepository } from '../../../../src/db/repositories/sqlite/thread.repository.js'
import { SQLiteThreadContributionRepository } from '../../../../src/db/repositories/sqlite/thread-contribution.repository.js'
import { SQLiteThreadKeyRepository } from '../../../../src/db/repositories/sqlite/thread-key.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import { randomUUID } from 'node:crypto'

describe('SQLiteThreadRepository', () => {
  let db: Database.Database
  let threadRepo: SQLiteThreadRepository
  let clawRepo: SQLiteClawRepository
  let creatorId: string
  let friendId: string

  beforeEach(async () => {
    db = createTestDatabase()
    threadRepo = new SQLiteThreadRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const creator = await clawRepo.register({ publicKey: 'pk-creator', displayName: 'Creator' })
    const friend = await clawRepo.register({ publicKey: 'pk-friend', displayName: 'Friend' })
    creatorId = creator.clawId
    friendId = friend.clawId
  })

  afterEach(() => db.close())

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a thread with required fields', async () => {
      const id = randomUUID()
      const thread = await threadRepo.create({
        id,
        creatorId,
        purpose: 'tracking',
        title: 'Q1 Planning',
      })

      expect(thread.id).toBe(id)
      expect(thread.creatorId).toBe(creatorId)
      expect(thread.purpose).toBe('tracking')
      expect(thread.title).toBe('Q1 Planning')
      expect(thread.status).toBe('active')
      expect(thread.createdAt).toBeTruthy()
      expect(thread.updatedAt).toBeTruthy()
    })

    it('should accept all valid purposes', async () => {
      const purposes = ['tracking', 'debate', 'creation', 'accountability', 'coordination'] as const
      for (const purpose of purposes) {
        const thread = await threadRepo.create({
          id: randomUUID(),
          creatorId,
          purpose,
          title: `Thread for ${purpose}`,
        })
        expect(thread.purpose).toBe(purpose)
      }
    })
  })

  // ─── findById ────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return thread by id', async () => {
      const id = randomUUID()
      await threadRepo.create({ id, creatorId, purpose: 'debate', title: 'Test' })
      const found = await threadRepo.findById(id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(id)
    })

    it('should return null for non-existent thread', async () => {
      const found = await threadRepo.findById(randomUUID())
      expect(found).toBeNull()
    })
  })

  // ─── updateStatus ────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update thread status', async () => {
      const id = randomUUID()
      await threadRepo.create({ id, creatorId, purpose: 'tracking', title: 'Test' })
      await threadRepo.updateStatus(id, 'completed')
      const found = await threadRepo.findById(id)
      expect(found!.status).toBe('completed')
    })

    it('should support archived status', async () => {
      const id = randomUUID()
      await threadRepo.create({ id, creatorId, purpose: 'tracking', title: 'Test' })
      await threadRepo.updateStatus(id, 'archived')
      const found = await threadRepo.findById(id)
      expect(found!.status).toBe('archived')
    })
  })

  // ─── touch ───────────────────────────────────────────────────────────────

  describe('touch', () => {
    it('should update updated_at', async () => {
      const id = randomUUID()
      await threadRepo.create({ id, creatorId, purpose: 'tracking', title: 'Test' })
      const before = await threadRepo.findById(id)
      await new Promise((r) => setTimeout(r, 10))
      await threadRepo.touch(id)
      const after = await threadRepo.findById(id)
      expect(after!.updatedAt >= before!.updatedAt).toBe(true)
    })
  })

  // ─── 参与者管理 ───────────────────────────────────────────────────────────

  describe('participant management', () => {
    let threadId: string

    beforeEach(async () => {
      threadId = randomUUID()
      await threadRepo.create({ id: threadId, creatorId, purpose: 'coordination', title: 'P Test' })
    })

    it('should add participant', async () => {
      await threadRepo.addParticipant(threadId, creatorId)
      const isP = await threadRepo.isParticipant(threadId, creatorId)
      expect(isP).toBe(true)
    })

    it('should return false for non-participant', async () => {
      const isP = await threadRepo.isParticipant(threadId, friendId)
      expect(isP).toBe(false)
    })

    it('should get all participants', async () => {
      await threadRepo.addParticipant(threadId, creatorId)
      await threadRepo.addParticipant(threadId, friendId)
      const participants = await threadRepo.getParticipants(threadId)
      expect(participants).toHaveLength(2)
      const clawIds = participants.map((p) => p.clawId)
      expect(clawIds).toContain(creatorId)
      expect(clawIds).toContain(friendId)
    })

    it('should remove participant', async () => {
      await threadRepo.addParticipant(threadId, friendId)
      await threadRepo.removeParticipant(threadId, friendId)
      const isP = await threadRepo.isParticipant(threadId, friendId)
      expect(isP).toBe(false)
    })
  })

  // ─── findByParticipant ──────────────────────────────────────────────────

  describe('findByParticipant', () => {
    it('should return threads where claw is participant', async () => {
      const t1 = randomUUID()
      const t2 = randomUUID()
      await threadRepo.create({ id: t1, creatorId, purpose: 'tracking', title: 'Thread 1' })
      await threadRepo.create({ id: t2, creatorId, purpose: 'debate', title: 'Thread 2' })
      await threadRepo.addParticipant(t1, creatorId)
      await threadRepo.addParticipant(t2, creatorId)

      const threads = await threadRepo.findByParticipant(creatorId)
      expect(threads.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by status', async () => {
      const t1 = randomUUID()
      const t2 = randomUUID()
      await threadRepo.create({ id: t1, creatorId, purpose: 'tracking', title: 'Active' })
      await threadRepo.create({ id: t2, creatorId, purpose: 'tracking', title: 'Done' })
      await threadRepo.addParticipant(t1, creatorId)
      await threadRepo.addParticipant(t2, creatorId)
      await threadRepo.updateStatus(t2, 'completed')

      const active = await threadRepo.findByParticipant(creatorId, { status: 'active' })
      const activeIds = active.map((t) => t.id)
      expect(activeIds).toContain(t1)
      expect(activeIds).not.toContain(t2)
    })

    it('should filter by purpose', async () => {
      const t1 = randomUUID()
      const t2 = randomUUID()
      await threadRepo.create({ id: t1, creatorId, purpose: 'debate', title: 'Debate' })
      await threadRepo.create({ id: t2, creatorId, purpose: 'tracking', title: 'Tracking' })
      await threadRepo.addParticipant(t1, creatorId)
      await threadRepo.addParticipant(t2, creatorId)

      const debates = await threadRepo.findByParticipant(creatorId, { purpose: 'debate' })
      const debateIds = debates.map((t) => t.id)
      expect(debateIds).toContain(t1)
      expect(debateIds).not.toContain(t2)
    })
  })

  // ─── getContributionCount ────────────────────────────────────────────────

  describe('getContributionCount', () => {
    it('should return 0 for new thread', async () => {
      const id = randomUUID()
      await threadRepo.create({ id, creatorId, purpose: 'tracking', title: 'Count Test' })
      const count = await threadRepo.getContributionCount(id)
      expect(count).toBe(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SQLiteThreadContributionRepository', () => {
  let db: Database.Database
  let threadRepo: SQLiteThreadRepository
  let contribRepo: SQLiteThreadContributionRepository
  let clawRepo: SQLiteClawRepository
  let creatorId: string
  let threadId: string

  beforeEach(async () => {
    db = createTestDatabase()
    threadRepo = new SQLiteThreadRepository(db)
    contribRepo = new SQLiteThreadContributionRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const creator = await clawRepo.register({ publicKey: 'pk-c2', displayName: 'C2' })
    creatorId = creator.clawId
    threadId = randomUUID()
    await threadRepo.create({ id: threadId, creatorId, purpose: 'debate', title: 'Debate Test' })
    await threadRepo.addParticipant(threadId, creatorId)
  })

  afterEach(() => db.close())

  const makeContrib = (overrides: Partial<{
    id: string
    threadId: string
    contributorId: string
    encryptedContent: string
    nonce: string
    contentType: 'text' | 'pearl_ref' | 'link' | 'reaction'
  }> = {}) => ({
    id: randomUUID(),
    threadId,
    contributorId: creatorId,
    encryptedContent: 'encrypted_base64_content',
    nonce: randomUUID().replace(/-/g, '').slice(0, 16),
    contentType: 'text' as const,
    ...overrides,
  })

  describe('create', () => {
    it('should create contribution with E2EE fields', async () => {
      const data = makeContrib()
      const contrib = await contribRepo.create(data)

      expect(contrib.id).toBe(data.id)
      expect(contrib.threadId).toBe(threadId)
      expect(contrib.contributorId).toBe(creatorId)
      expect(contrib.encryptedContent).toBe('encrypted_base64_content')
      expect(contrib.nonce).toBe(data.nonce)
      expect(contrib.contentType).toBe('text')
      expect(contrib.createdAt).toBeTruthy()
    })

    it('should accept all content types', async () => {
      const types = ['text', 'pearl_ref', 'link', 'reaction'] as const
      for (const contentType of types) {
        const contrib = await contribRepo.create(makeContrib({
          contentType,
          nonce: randomUUID().replace(/-/g, '').slice(0, 16),
        }))
        expect(contrib.contentType).toBe(contentType)
      }
    })

    it('should reject duplicate nonce in same thread', async () => {
      const nonce = 'fixed_nonce_16ch'
      await contribRepo.create(makeContrib({ nonce }))
      await expect(
        contribRepo.create(makeContrib({ nonce }))
      ).rejects.toThrow()
    })
  })

  describe('findByThread', () => {
    it('should return contributions in ascending time order', async () => {
      await contribRepo.create(makeContrib({ nonce: 'nonce_aaa_0001' }))
      await contribRepo.create(makeContrib({ nonce: 'nonce_bbb_0002' }))
      const contribs = await contribRepo.findByThread(threadId)
      expect(contribs.length).toBe(2)
      expect(contribs[0].createdAt <= contribs[1].createdAt).toBe(true)
    })

    it('should support limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await contribRepo.create(makeContrib({
          nonce: `nonce_limit_${i.toString().padStart(4, '0')}`,
        }))
      }
      const limited = await contribRepo.findByThread(threadId, { limit: 2 })
      expect(limited.length).toBe(2)
    })
  })

  describe('countByThread', () => {
    it('should return correct count', async () => {
      await contribRepo.create(makeContrib({ nonce: 'cnt_nonce_0001' }))
      await contribRepo.create(makeContrib({ nonce: 'cnt_nonce_0002' }))
      const count = await contribRepo.countByThread(threadId)
      expect(count).toBe(2)
    })
  })

  describe('findByContributor', () => {
    it('should return contributions for specified contributor', async () => {
      await contribRepo.create(makeContrib({ nonce: 'contributor_test_1' }))
      const contribs = await contribRepo.findByContributor(threadId, creatorId)
      expect(contribs.length).toBe(1)
      expect(contribs[0].contributorId).toBe(creatorId)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SQLiteThreadKeyRepository', () => {
  let db: Database.Database
  let threadRepo: SQLiteThreadRepository
  let keyRepo: SQLiteThreadKeyRepository
  let clawRepo: SQLiteClawRepository
  let creatorId: string
  let friendId: string
  let threadId: string

  beforeEach(async () => {
    db = createTestDatabase()
    threadRepo = new SQLiteThreadRepository(db)
    keyRepo = new SQLiteThreadKeyRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    const creator = await clawRepo.register({ publicKey: 'pk-k1', displayName: 'K1' })
    const friend = await clawRepo.register({ publicKey: 'pk-k2', displayName: 'K2' })
    creatorId = creator.clawId
    friendId = friend.clawId
    threadId = randomUUID()
    await threadRepo.create({ id: threadId, creatorId, purpose: 'creation', title: 'Key Test' })
    await threadRepo.addParticipant(threadId, creatorId)
    await threadRepo.addParticipant(threadId, friendId)
  })

  afterEach(() => db.close())

  describe('upsert', () => {
    it('should create key record', async () => {
      await keyRepo.upsert({
        threadId,
        clawId: creatorId,
        encryptedKey: 'encrypted_key_base64_creator',
        distributedBy: creatorId,
      })
      const hasKey = await keyRepo.hasKey(threadId, creatorId)
      expect(hasKey).toBe(true)
    })

    it('should overwrite existing key record on upsert', async () => {
      await keyRepo.upsert({
        threadId,
        clawId: creatorId,
        encryptedKey: 'key_v1',
        distributedBy: creatorId,
      })
      await keyRepo.upsert({
        threadId,
        clawId: creatorId,
        encryptedKey: 'key_v2',
        distributedBy: creatorId,
      })
      const record = await keyRepo.findByThreadAndClaw(threadId, creatorId)
      expect(record!.encryptedKey).toBe('key_v2')
    })
  })

  describe('findByThreadAndClaw', () => {
    it('should return key record for participant', async () => {
      await keyRepo.upsert({
        threadId,
        clawId: friendId,
        encryptedKey: 'friend_encrypted_key',
        distributedBy: creatorId,
      })
      const record = await keyRepo.findByThreadAndClaw(threadId, friendId)
      expect(record).not.toBeNull()
      expect(record!.encryptedKey).toBe('friend_encrypted_key')
      expect(record!.distributedBy).toBe(creatorId)
    })

    it('should return null if no key exists', async () => {
      const record = await keyRepo.findByThreadAndClaw(threadId, friendId)
      expect(record).toBeNull()
    })
  })

  describe('hasKey', () => {
    it('should return false for participant without key', async () => {
      const has = await keyRepo.hasKey(threadId, friendId)
      expect(has).toBe(false)
    })

    it('should return true after upsert', async () => {
      await keyRepo.upsert({
        threadId,
        clawId: friendId,
        encryptedKey: 'some_key',
        distributedBy: creatorId,
      })
      const has = await keyRepo.hasKey(threadId, friendId)
      expect(has).toBe(true)
    })
  })

  describe('findByThread', () => {
    it('should return all key records for a thread', async () => {
      await keyRepo.upsert({ threadId, clawId: creatorId, encryptedKey: 'key_c', distributedBy: creatorId })
      await keyRepo.upsert({ threadId, clawId: friendId, encryptedKey: 'key_f', distributedBy: creatorId })
      const records = await keyRepo.findByThread(threadId)
      expect(records).toHaveLength(2)
      const clawIds = records.map((r) => r.clawId)
      expect(clawIds).toContain(creatorId)
      expect(clawIds).toContain(friendId)
    })
  })
})
