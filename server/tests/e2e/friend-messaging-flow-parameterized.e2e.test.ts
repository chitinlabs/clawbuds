/**
 * E2E Test: Friend Request to Direct Messaging Flow (Parameterized)
 *
 * Tests the complete user journey across multiple Repositories:
 * - IClawRepository: User registration
 * - IFriendshipRepository: Friend requests and management
 * - IMessageRepository: Direct messages and reactions
 *
 * This test runs on BOTH SQLite and Supabase implementations
 * to verify Repository abstraction consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TestContext, TestClaw, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
  sendFriendRequest,
  getPendingRequests,
  acceptFriendRequest,
  makeFriends,
  sendDirectMessage,
  getInbox,
  addReaction,
  getReactions,
  listFriends,
  removeFriend,
} from './helpers.js'

// Get available repository types (conditionally includes Supabase if configured)
const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)(
  'E2E: Friend Messaging Flow [%s]',
  (repositoryType: RepositoryType) => {
    let tc: TestContext
    let alice: TestClaw
    let bob: TestClaw

    beforeEach(async () => {
      tc = createTestContext({ repositoryType })
      alice = await registerClaw(tc.app, 'Alice')
      bob = await registerClaw(tc.app, 'Bob')
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    describe('Complete Friend-to-Chat Journey', () => {
      it('should complete full flow: register → friend request → accept → message → reaction', async () => {
        // Verify repository type in context
        expect(tc.repositoryType).toBe(repositoryType)

        // 1. Verify both users registered successfully
        expect(alice.clawId).toMatch(/^claw_[0-9a-f]{16}$/)
        expect(bob.clawId).toMatch(/^claw_[0-9a-f]{16}$/)

        // 2. Alice sends friend request to Bob
        const friendshipId = await sendFriendRequest(tc.app, alice, bob)
        expect(friendshipId).toBeTruthy()

        // 3. Bob views pending requests
        const pendingRequests = await getPendingRequests(tc.app, bob)
        expect(pendingRequests).toHaveLength(1)
        expect((pendingRequests[0] as any).requesterId).toBe(alice.clawId)

        // 4. Bob accepts the friend request
        await acceptFriendRequest(tc.app, bob, friendshipId)

        // 5. Verify both are now friends
        const aliceFriends = await listFriends(tc.app, alice)
        const bobFriends = await listFriends(tc.app, bob)

        expect(aliceFriends).toHaveLength(1)
        expect(bobFriends).toHaveLength(1)

        // 6. Alice sends direct message to Bob
        const messageId = await sendDirectMessage(tc.app, alice, bob, 'Hi Bob! 👋')

        // 7. Bob checks inbox and sees the message
        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(1)

        const inboxEntry = bobInbox[0] as any
        expect(inboxEntry.message.fromClawId).toBe(alice.clawId)
        expect(inboxEntry.message.blocks[0].text).toBe('Hi Bob! 👋')

        // 8. Bob adds a reaction to the message
        await addReaction(tc.app, bob, messageId, '👍')

        // 9. Alice views reactions on her message
        const reactions = await getReactions(tc.app, alice, messageId)
        expect(reactions).toHaveLength(1)
        expect((reactions[0] as any).emoji).toBe('👍')
        expect((reactions[0] as any).clawIds).toContain(bob.clawId)
      })

      it('should prevent messaging non-friends', async () => {
        // Alice tries to send message to Bob without being friends
        let errorThrown = false
        try {
          await sendDirectMessage(tc.app, alice, bob, 'Hello stranger')
        } catch (err) {
          errorThrown = true
        }

        expect(errorThrown).toBe(true)

        // Bob's inbox should be empty
        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(0)
      })

      it('should handle friend removal', async () => {
        // Become friends
        await makeFriends(tc.app, alice, bob)

        // Alice sends message
        await sendDirectMessage(tc.app, alice, bob, 'Message before unfriend')

        // Alice removes Bob as friend
        await removeFriend(tc.app, alice, bob.clawId)

        // Verify they are no longer friends
        const aliceFriends = await listFriends(tc.app, alice)
        expect(aliceFriends).toHaveLength(0)

        // Alice cannot send new messages
        let errorThrown = false
        try {
          await sendDirectMessage(tc.app, alice, bob, 'After unfriend')
        } catch (err) {
          errorThrown = true
        }

        expect(errorThrown).toBe(true)
      })
    })

    describe('Auto-Accept Reverse Request', () => {
      it('should auto-accept when both users send requests simultaneously', async () => {
        // Alice sends request to Bob
        await sendFriendRequest(tc.app, alice, bob)

        // Bob also sends request to Alice (should auto-accept)
        const friendshipId = await sendFriendRequest(tc.app, bob, alice)
        expect(friendshipId).toBeTruthy()

        // Verify both are immediately friends
        const aliceFriends = await listFriends(tc.app, alice)
        const bobFriends = await listFriends(tc.app, bob)

        expect(aliceFriends).toHaveLength(1)
        expect(bobFriends).toHaveLength(1)

        // Verify they can immediately message each other
        const messageId = await sendDirectMessage(tc.app, alice, bob, 'We are friends now!')

        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(1)
      })
    })

    describe('Repository Type Verification', () => {
      it(`should be using ${repositoryType} repository`, () => {
        expect(tc.repositoryType).toBe(repositoryType)
      })
    })
  },
)

// Summary: Run status based on available repository types
if (REPOSITORY_TYPES.length === 1) {
  console.log(`
  ℹ️  Repository Testing Info:
  - Running tests on: SQLite only
  - Supabase tests skipped (not configured)
  - To enable Supabase tests, set SUPABASE_URL and SUPABASE_ANON_KEY env vars
  `)
} else {
  console.log(`
  ✓ Repository Testing Info:
  - Running tests on: ${REPOSITORY_TYPES.join(', ')}
  - All repository types configured
  `)
}
