/**
 * ThreadService Unit Tests（Phase 8）
 * 覆盖：create / findById / findMyThreads / contribute / invite / requestDigest / updateStatus
 * E2EE 测试：验证服务端处理密文而非明文
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../src/db/database.js'
import { ThreadService } from '../../../src/services/thread.service.js'
import { SQLiteThreadRepository } from '../../../src/db/repositories/sqlite/thread.repository.js'
import { SQLiteThreadContributionRepository } from '../../../src/db/repositories/sqlite/thread-contribution.repository.js'
import { SQLiteThreadKeyRepository } from '../../../src/db/repositories/sqlite/thread-key.repository.js'
import { SQLiteClawRepository } from '../../../src/db/repositories/sqlite/claw.repository.js'
import type { FriendshipService } from '../../../src/services/friendship.service.js'
import { EventBus } from '../../../src/services/event-bus.js'
import { NoopNotifier } from '../../../src/services/host-notifier.js'
import { randomUUID } from 'node:crypto'

// Mock FriendshipService: 默认好友关系为 true（creator <-> friend），stranger 为 false
function makeMockFriendshipService(friends: string[][] = []): Pick<FriendshipService, 'areFriends'> {
  return {
    areFriends: vi.fn().mockImplementation(async (a: string, b: string) => {
      return friends.some(
        ([x, y]) => (x === a && y === b) || (x === b && y === a),
      )
    }),
  } as unknown as Pick<FriendshipService, 'areFriends'>
}

describe('ThreadService', () => {
  let db: Database.Database
  let threadService: ThreadService
  let clawRepo: SQLiteClawRepository
  let eventBus: EventBus
  let creatorId: string
  let friendId: string
  let strangerClawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    const threadRepo = new SQLiteThreadRepository(db)
    const contribRepo = new SQLiteThreadContributionRepository(db)
    const keyRepo = new SQLiteThreadKeyRepository(db)
    clawRepo = new SQLiteClawRepository(db)
    eventBus = new EventBus()
    const hostNotifier = new NoopNotifier()

    const creator = await clawRepo.register({ publicKey: 'pk-creator-ts', displayName: 'Creator' })
    const friend = await clawRepo.register({ publicKey: 'pk-friend-ts', displayName: 'Friend' })
    const stranger = await clawRepo.register({ publicKey: 'pk-stranger-ts', displayName: 'Stranger' })
    creatorId = creator.clawId
    friendId = friend.clawId
    strangerClawId = stranger.clawId

    // Mock FriendshipService: creator <-> friend 是好友，stranger 不是
    const friendshipService = makeMockFriendshipService([[creatorId, friendId]])

    threadService = new ThreadService(
      threadRepo,
      contribRepo,
      keyRepo,
      friendshipService as unknown as FriendshipService,
      hostNotifier,
      eventBus,
    )
  })

  afterEach(() => {
    eventBus.removeAllListeners()
    db.close()
  })

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create thread and add creator as participant', async () => {
      const thread = await threadService.create(creatorId, {
        purpose: 'tracking',
        title: 'Q1 Planning',
      })

      expect(thread.creatorId).toBe(creatorId)
      expect(thread.purpose).toBe('tracking')
      expect(thread.title).toBe('Q1 Planning')
      expect(thread.status).toBe('active')
    })

    it('should invite friends as participants', async () => {
      const thread = await threadService.create(creatorId, {
        purpose: 'debate',
        title: 'Debate Test',
        participants: [friendId],
      })

      const threadRepo = new SQLiteThreadRepository(db)
      const isCreatorParticipant = await threadRepo.isParticipant(thread.id, creatorId)
      const isFriendParticipant = await threadRepo.isParticipant(thread.id, friendId)
      expect(isCreatorParticipant).toBe(true)
      expect(isFriendParticipant).toBe(true)
    })

    it('should reject non-friend participants with 403', async () => {
      await expect(
        threadService.create(creatorId, {
          purpose: 'tracking',
          title: 'Bad Thread',
          participants: [strangerClawId],
        }),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('should emit thread.created event', async () => {
      const events: unknown[] = []
      eventBus.on('thread.created', (e) => events.push(e))

      await threadService.create(creatorId, { purpose: 'coordination', title: 'Event Test' })
      expect(events).toHaveLength(1)
    })

    it('should save encryptedKeys to thread_keys table', async () => {
      const encryptedKeyForCreator = 'encrypted_key_creator_base64'
      const encryptedKeyForFriend = 'encrypted_key_friend_base64'

      const thread = await threadService.create(creatorId, {
        purpose: 'creation',
        title: 'E2EE Test',
        participants: [friendId],
        encryptedKeys: {
          [creatorId]: encryptedKeyForCreator,
          [friendId]: encryptedKeyForFriend,
        },
      })

      const keyRepo = new SQLiteThreadKeyRepository(db)
      const creatorKey = await keyRepo.findByThreadAndClaw(thread.id, creatorId)
      const friendKey = await keyRepo.findByThreadAndClaw(thread.id, friendId)
      expect(creatorKey?.encryptedKey).toBe(encryptedKeyForCreator)
      expect(friendKey?.encryptedKey).toBe(encryptedKeyForFriend)
    })
  })

  // ─── findById ────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return thread for participant', async () => {
      const created = await threadService.create(creatorId, { purpose: 'debate', title: 'Find Test' })
      const found = await threadService.findById(created.id, creatorId)
      expect(found?.id).toBe(created.id)
    })

    it('should return null for non-participant', async () => {
      const created = await threadService.create(creatorId, { purpose: 'debate', title: 'Access Test' })
      const found = await threadService.findById(created.id, strangerClawId)
      expect(found).toBeNull()
    })
  })

  // ─── findMyThreads ───────────────────────────────────────────────────────

  describe('findMyThreads', () => {
    it('should return threads for participant', async () => {
      await threadService.create(creatorId, { purpose: 'tracking', title: 'My Thread 1' })
      await threadService.create(creatorId, { purpose: 'debate', title: 'My Thread 2' })
      const threads = await threadService.findMyThreads(creatorId)
      expect(threads.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by status', async () => {
      const t1 = await threadService.create(creatorId, { purpose: 'tracking', title: 'Active' })
      const t2 = await threadService.create(creatorId, { purpose: 'tracking', title: 'Done' })
      await threadService.updateStatus(t2.id, creatorId, 'completed')

      const active = await threadService.findMyThreads(creatorId, { status: 'active' })
      const activeIds = active.map((t) => t.id)
      expect(activeIds).toContain(t1.id)
      expect(activeIds).not.toContain(t2.id)
    })
  })

  // ─── contribute ──────────────────────────────────────────────────────────

  describe('contribute', () => {
    let threadId: string

    beforeEach(async () => {
      const thread = await threadService.create(creatorId, { purpose: 'debate', title: 'Contrib Test' })
      threadId = thread.id
    })

    it('should create contribution with encrypted content', async () => {
      const contrib = await threadService.contribute(
        threadId,
        creatorId,
        'encrypted_content_base64',
        'nonce_16chars_ok',
        'text',
      )

      expect(contrib.encryptedContent).toBe('encrypted_content_base64')
      expect(contrib.nonce).toBe('nonce_16chars_ok')
      expect(contrib.contentType).toBe('text')
    })

    it('should reject non-participant contribution with 403', async () => {
      await expect(
        threadService.contribute(threadId, strangerClawId, 'enc', 'nonce_16_chars', 'text'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('should reject contribution to non-active thread', async () => {
      await threadService.updateStatus(threadId, creatorId, 'completed')
      await expect(
        threadService.contribute(threadId, creatorId, 'enc', 'nonce_16chars_0', 'text'),
      ).rejects.toMatchObject({ statusCode: 400 })
    })

    it('should emit thread.contribution_added event', async () => {
      const events: unknown[] = []
      eventBus.on('thread.contribution_added', (e) => events.push(e))

      await threadService.contribute(threadId, creatorId, 'enc', 'nonce_16chars_1', 'text')
      expect(events).toHaveLength(1)
    })
  })

  // ─── getContributions ────────────────────────────────────────────────────

  describe('getContributions', () => {
    it('should return contributions for participant', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'debate', title: 'Get Contribs' })
      await threadService.contribute(thread.id, creatorId, 'enc1', 'nonce_16chars_a', 'text')
      await threadService.contribute(thread.id, creatorId, 'enc2', 'nonce_16chars_b', 'reaction')

      const contribs = await threadService.getContributions(thread.id, creatorId)
      expect(contribs.length).toBe(2)
    })

    it('should reject non-participant access with 403', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'debate', title: 'Access Test2' })
      await expect(
        threadService.getContributions(thread.id, strangerClawId),
      ).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  // ─── invite ──────────────────────────────────────────────────────────────

  describe('invite', () => {
    it('should add friend as participant', async () => {
      const newFriend = await clawRepo.register({ publicKey: 'pk-new-friend', displayName: 'NewFriend' })
      const newFriendId = newFriend.clawId

      // 用 mock FriendshipService 包含 creator <-> newFriend 好友关系
      const threadRepo2 = new SQLiteThreadRepository(db)
      const contribRepo2 = new SQLiteThreadContributionRepository(db)
      const keyRepo2 = new SQLiteThreadKeyRepository(db)
      const fs2 = makeMockFriendshipService([[creatorId, friendId], [creatorId, newFriendId]])
      const localService = new ThreadService(
        threadRepo2, contribRepo2, keyRepo2,
        fs2 as unknown as FriendshipService,
        new NoopNotifier(), eventBus,
      )

      const thread = await localService.create(creatorId, { purpose: 'coordination', title: 'Invite Test' })
      await localService.invite(thread.id, creatorId, newFriendId, 'encrypted_key_for_invitee')

      const threadRepo = new SQLiteThreadRepository(db)
      const isParticipant = await threadRepo.isParticipant(thread.id, newFriendId)
      expect(isParticipant).toBe(true)
    })

    it('should reject invite of non-friend with 403', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'coordination', title: 'Invite Fail' })
      await expect(
        threadService.invite(thread.id, creatorId, strangerClawId, 'key'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('should reject invite by non-participant with 403', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'coordination', title: 'Non-part Invite' })
      await expect(
        threadService.invite(thread.id, strangerClawId, friendId, 'key'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  // ─── requestDigest ───────────────────────────────────────────────────────

  describe('requestDigest', () => {
    it('should succeed for participant', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'debate', title: 'Digest Test' })
      await expect(threadService.requestDigest(thread.id, creatorId)).resolves.not.toThrow()
    })

    it('should reject for non-participant with 403', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'debate', title: 'Digest Fail' })
      await expect(
        threadService.requestDigest(thread.id, strangerClawId),
      ).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  // ─── updateStatus ────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should allow creator to change status', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'tracking', title: 'Status Test' })
      await threadService.updateStatus(thread.id, creatorId, 'completed')

      const updated = await threadService.findById(thread.id, creatorId)
      expect(updated?.status).toBe('completed')
    })

    it('should reject non-creator status change with 403', async () => {
      const thread = await threadService.create(creatorId, {
        purpose: 'tracking',
        title: 'Status Fail',
        participants: [friendId],
      })
      await expect(
        threadService.updateStatus(thread.id, friendId, 'completed'),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it('should emit thread.status_changed event', async () => {
      const events: unknown[] = []
      eventBus.on('thread.status_changed', (e) => events.push(e))

      const thread = await threadService.create(creatorId, { purpose: 'tracking', title: 'Event Status' })
      await threadService.updateStatus(thread.id, creatorId, 'archived')
      expect(events).toHaveLength(1)
    })
  })

  // ─── getMyKey ─────────────────────────────────────────────────────────────

  describe('getMyKey', () => {
    it('should return key for participant', async () => {
      const thread = await threadService.create(creatorId, {
        purpose: 'creation',
        title: 'Key Test',
        encryptedKeys: { [creatorId]: 'my_key_base64' },
      })

      const key = await threadService.getMyKey(thread.id, creatorId)
      expect(key?.encryptedKey).toBe('my_key_base64')
    })

    it('should return null if no key', async () => {
      const thread = await threadService.create(creatorId, { purpose: 'tracking', title: 'No Key' })
      const key = await threadService.getMyKey(thread.id, creatorId)
      expect(key).toBeNull()
    })
  })
})
