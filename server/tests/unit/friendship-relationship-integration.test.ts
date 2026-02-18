/**
 * 任务 27.1：FriendshipService + RelationshipService 集成测试
 * friend.accepted → initializeRelationship 双向
 * friend.removed → removeRelationship 双向
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteFriendshipRepository } from '../../src/db/repositories/sqlite/friendship.repository.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'
import { SQLiteRelationshipStrengthRepository } from '../../src/db/repositories/sqlite/relationship-strength.repository.js'
import { FriendshipService } from '../../src/services/friendship.service.js'
import { RelationshipService } from '../../src/services/relationship.service.js'
import { EventBus } from '../../src/services/event-bus.js'

describe('FriendshipService + RelationshipService Integration', () => {
  let db: Database.Database
  let clawRepo: SQLiteClawRepository
  let friendshipRepo: SQLiteFriendshipRepository
  let rsRepo: SQLiteRelationshipStrengthRepository
  let eventBus: EventBus
  let friendshipService: FriendshipService
  let relationshipService: RelationshipService
  let aliceId: string
  let bobId: string

  beforeEach(async () => {
    db = createTestDatabase()
    clawRepo = new SQLiteClawRepository(db)
    friendshipRepo = new SQLiteFriendshipRepository(db)
    rsRepo = new SQLiteRelationshipStrengthRepository(db)
    eventBus = new EventBus()
    friendshipService = new FriendshipService(friendshipRepo, eventBus)
    relationshipService = new RelationshipService(rsRepo, eventBus)

    const alice = await clawRepo.register({ publicKey: 'pk-alice', displayName: 'Alice' })
    const bob = await clawRepo.register({ publicKey: 'pk-bob', displayName: 'Bob' })
    aliceId = alice.clawId
    bobId = bob.clawId

    // Register EventBus listeners (simulating app.ts integration)
    eventBus.on('friend.accepted', async ({ friendship }) => {
      const { requesterId, accepterId } = friendship
      await Promise.all([
        relationshipService.initializeRelationship(requesterId, accepterId),
        relationshipService.initializeRelationship(accepterId, requesterId),
      ])
    })

    eventBus.on('friend.removed', async ({ clawId, friendId }) => {
      await Promise.all([
        relationshipService.removeRelationship(clawId, friendId),
        relationshipService.removeRelationship(friendId, clawId),
      ])
    })
  })

  afterEach(() => {
    db.close()
    eventBus.removeAllListeners()
  })

  describe('friend.accepted → initializeRelationship', () => {
    it('should initialize bidirectional relationship strength when friend request is accepted', async () => {
      // Alice sends friend request, Bob accepts
      const req = await friendshipService.sendRequest(aliceId, bobId)
      await friendshipService.acceptRequest(bobId, req.id)

      // Wait for async event handler
      await new Promise((r) => setTimeout(r, 20))

      // Check bidirectional relationship strength was initialized
      const aliceToBob = await rsRepo.get(aliceId, bobId)
      const bobToAlice = await rsRepo.get(bobId, aliceId)

      expect(aliceToBob).not.toBeNull()
      expect(aliceToBob!.strength).toBe(0.5)
      expect(aliceToBob!.dunbarLayer).toBe('casual')

      expect(bobToAlice).not.toBeNull()
      expect(bobToAlice!.strength).toBe(0.5)
      expect(bobToAlice!.dunbarLayer).toBe('casual')
    })
  })

  describe('friend.removed → removeRelationship', () => {
    it('should remove bidirectional relationship strength when friend is removed', async () => {
      // Setup: make friends first
      const req = await friendshipService.sendRequest(aliceId, bobId)
      await friendshipService.acceptRequest(bobId, req.id)
      await new Promise((r) => setTimeout(r, 20)) // wait for initializeRelationship

      // Verify relationships exist
      expect(await rsRepo.get(aliceId, bobId)).not.toBeNull()
      expect(await rsRepo.get(bobId, aliceId)).not.toBeNull()

      // Alice removes Bob
      await friendshipService.removeFriend(aliceId, bobId)

      // Wait for async event handler
      await new Promise((r) => setTimeout(r, 20))

      // Both directions should be removed
      const aliceToBob = await rsRepo.get(aliceId, bobId)
      const bobToAlice = await rsRepo.get(bobId, aliceId)

      expect(aliceToBob).toBeNull()
      expect(bobToAlice).toBeNull()
    })
  })
})
