/**
 * SQLite Friendship Repository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteFriendshipRepository } from '../../../../src/db/repositories/sqlite/friendship.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'

describe('SQLiteFriendshipRepository', () => {
  let db: Database.Database
  let friendshipRepo: SQLiteFriendshipRepository
  let clawRepo: SQLiteClawRepository
  let user1Id: string
  let user2Id: string
  let user3Id: string

  beforeEach(async () => {
    db = createTestDatabase()
    friendshipRepo = new SQLiteFriendshipRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    // Create test users
    const user1 = await clawRepo.register({
      publicKey: 'user1-key',
      displayName: 'User 1',
    })
    const user2 = await clawRepo.register({
      publicKey: 'user2-key',
      displayName: 'User 2',
    })
    const user3 = await clawRepo.register({
      publicKey: 'user3-key',
      displayName: 'User 3',
    })

    user1Id = user1.clawId
    user2Id = user2.clawId
    user3Id = user3.clawId
  })

  afterEach(() => {
    db.close()
  })

  describe('sendFriendRequest', () => {
    it('should send a friend request', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('pending')
    })

    it('should allow sending multiple friend requests to different users', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.sendFriendRequest(user1Id, user3Id)

      const status1 = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      const status2 = await friendshipRepo.getFriendshipStatus(user1Id, user3Id)

      expect(status1).toBe('pending')
      expect(status2).toBe('pending')
    })
  })

  describe('acceptFriendRequest', () => {
    it('should accept a friend request', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const areFriends = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(areFriends).toBe(true)
    })

    it('should work bidirectionally', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const check1 = await friendshipRepo.areFriends(user1Id, user2Id)
      const check2 = await friendshipRepo.areFriends(user2Id, user1Id)

      expect(check1).toBe(true)
      expect(check2).toBe(true)
    })
  })

  describe('rejectFriendRequest', () => {
    it('should reject a friend request', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.rejectFriendRequest(user2Id, user1Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('rejected')
    })

    it('should not become friends after rejection', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.rejectFriendRequest(user2Id, user1Id)

      const areFriends = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(areFriends).toBe(false)
    })
  })

  describe('areFriends', () => {
    it('should return true for accepted friendships', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const result = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(result).toBe(true)
    })

    it('should return false for pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const result = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(result).toBe(false)
    })

    it('should return false for no relationship', async () => {
      const result = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(result).toBe(false)
    })
  })

  describe('listFriends', () => {
    it('should list all friends', async () => {
      // User1 befriends User2 and User3
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.sendFriendRequest(user1Id, user3Id)
      await friendshipRepo.acceptFriendRequest(user3Id, user1Id)

      const friends = await friendshipRepo.listFriends(user1Id)

      expect(friends).toHaveLength(2)
      expect(friends.map((f) => f.clawId)).toContain(user2Id)
      expect(friends.map((f) => f.clawId)).toContain(user3Id)
    })

    it('should include friend profile information', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const friends = await friendshipRepo.listFriends(user1Id)

      expect(friends).toHaveLength(1)
      expect(friends[0].displayName).toBe('User 2')
      expect(friends[0].status).toBe('accepted')
    })

    it('should return empty array for no friends', async () => {
      const friends = await friendshipRepo.listFriends(user1Id)
      expect(friends).toEqual([])
    })

    it('should not include pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const friends = await friendshipRepo.listFriends(user1Id)
      expect(friends).toHaveLength(0)
    })
  })

  describe('listPendingRequests', () => {
    it('should list pending incoming requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.sendFriendRequest(user3Id, user2Id)

      const requests = await friendshipRepo.listPendingRequests(user2Id)

      expect(requests).toHaveLength(2)
      expect(requests.map((r) => r.fromClawId)).toContain(user1Id)
      expect(requests.map((r) => r.fromClawId)).toContain(user3Id)
    })

    it('should return empty array for no pending requests', async () => {
      const requests = await friendshipRepo.listPendingRequests(user1Id)
      expect(requests).toEqual([])
    })

    it('should not include accepted requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const requests = await friendshipRepo.listPendingRequests(user2Id)
      expect(requests).toHaveLength(0)
    })
  })

  describe('listSentRequests', () => {
    it('should list sent pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.sendFriendRequest(user1Id, user3Id)

      const requests = await friendshipRepo.listSentRequests(user1Id)

      expect(requests).toHaveLength(2)
      expect(requests.map((r) => r.toClawId)).toContain(user2Id)
      expect(requests.map((r) => r.toClawId)).toContain(user3Id)
    })

    it('should return empty array for no sent requests', async () => {
      const requests = await friendshipRepo.listSentRequests(user1Id)
      expect(requests).toEqual([])
    })

    it('should not include accepted requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const requests = await friendshipRepo.listSentRequests(user1Id)
      expect(requests).toHaveLength(0)
    })
  })

  describe('getFriendshipStatus', () => {
    it('should return pending for pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('pending')
    })

    it('should return accepted for accepted friendships', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('accepted')
    })

    it('should return rejected for rejected requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.rejectFriendRequest(user2Id, user1Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('rejected')
    })

    it('should return null for no relationship', async () => {
      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBeNull()
    })

    it('should work bidirectionally', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const status1 = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      const status2 = await friendshipRepo.getFriendshipStatus(user2Id, user1Id)

      expect(status1).toBe('pending')
      expect(status2).toBe('pending')
    })
  })

  describe('removeFriend', () => {
    it('should remove a friend', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.removeFriend(user1Id, user2Id)

      const areFriends = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(areFriends).toBe(false)
    })

    it('should remove friendship status', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.removeFriend(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBeNull()
    })

    it('should work bidirectionally', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.removeFriend(user2Id, user1Id)

      const areFriends = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(areFriends).toBe(false)
    })
  })

  describe('blockUser', () => {
    it('should block a user', async () => {
      await friendshipRepo.blockUser(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('blocked')
    })

    it('should remove existing friendship when blocking', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.blockUser(user1Id, user2Id)

      const areFriends = await friendshipRepo.areFriends(user1Id, user2Id)
      expect(areFriends).toBe(false)
    })

    it('should create blocked status after removing friendship', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.blockUser(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBe('blocked')
    })
  })

  describe('unblockUser', () => {
    it('should unblock a user', async () => {
      await friendshipRepo.blockUser(user1Id, user2Id)
      await friendshipRepo.unblockUser(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBeNull()
    })

    it('should do nothing if user is not blocked', async () => {
      await friendshipRepo.unblockUser(user1Id, user2Id)

      const status = await friendshipRepo.getFriendshipStatus(user1Id, user2Id)
      expect(status).toBeNull()
    })
  })

  describe('countFriends', () => {
    it('should count accepted friendships', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)
      await friendshipRepo.sendFriendRequest(user1Id, user3Id)
      await friendshipRepo.acceptFriendRequest(user3Id, user1Id)

      const count = await friendshipRepo.countFriends(user1Id)
      expect(count).toBe(2)
    })

    it('should return 0 for no friends', async () => {
      const count = await friendshipRepo.countFriends(user1Id)
      expect(count).toBe(0)
    })

    it('should not count pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const count = await friendshipRepo.countFriends(user1Id)
      expect(count).toBe(0)
    })
  })

  describe('countPendingRequests', () => {
    it('should count incoming pending requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.sendFriendRequest(user3Id, user2Id)

      const count = await friendshipRepo.countPendingRequests(user2Id)
      expect(count).toBe(2)
    })

    it('should return 0 for no pending requests', async () => {
      const count = await friendshipRepo.countPendingRequests(user1Id)
      expect(count).toBe(0)
    })

    it('should not count sent requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)

      const count = await friendshipRepo.countPendingRequests(user1Id)
      expect(count).toBe(0)
    })

    it('should not count accepted requests', async () => {
      await friendshipRepo.sendFriendRequest(user1Id, user2Id)
      await friendshipRepo.acceptFriendRequest(user2Id, user1Id)

      const count = await friendshipRepo.countPendingRequests(user2Id)
      expect(count).toBe(0)
    })
  })
})
