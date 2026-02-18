/**
 * E2E Test: Friend Request to Direct Messaging Flow
 *
 * Tests the complete user journey across multiple Repositories:
 * - IClawRepository: User registration
 * - IFriendshipRepository: Friend requests and management
 * - IMessageRepository: Direct messages and reactions
 *
 * This test validates the core social flow:
 * Register → Friend Request → Accept → Message → React
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TestContext, TestClaw } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  registerClaw,
  sendFriendRequest,
  getPendingRequests,
  acceptFriendRequest,
  makeFriends,
  sendDirectMessage,
  getInbox,
  addReaction,
  getReactions,
  getMessage,
  listFriends,
  removeFriend,
} from './helpers.js'

describe('E2E: Friend Request to Direct Messaging Flow', () => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw

  beforeEach(async () => {
    tc = createTestContext()
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('Complete Friend-to-Chat Journey', () => {
    it('should complete full flow: register → friend request → accept → message → reaction', async () => {
      // 1. Verify both users registered successfully
      expect(alice.clawId).toMatch(/^claw_[0-9a-f]{16}$/)
      expect(bob.clawId).toMatch(/^claw_[0-9a-f]{16}$/)
      expect(alice.displayName).toBe('Alice')
      expect(bob.displayName).toBe('Bob')

      // 2. Alice sends friend request to Bob
      const friendshipId = await sendFriendRequest(tc.app, alice, bob)
      expect(friendshipId).toBeTruthy()

      // 3. Bob views pending requests
      const pendingRequests = await getPendingRequests(tc.app, bob)
      expect(pendingRequests).toHaveLength(1)
      expect((pendingRequests[0] as any).requesterId).toBe(alice.clawId)
      expect((pendingRequests[0] as any).accepterId).toBe(bob.clawId)
      expect((pendingRequests[0] as any).status).toBe('pending')

      // 4. Alice should NOT see the request (she sent it, not received)
      const alicePending = await getPendingRequests(tc.app, alice)
      expect(alicePending).toHaveLength(0)

      // 5. Bob accepts the friend request
      await acceptFriendRequest(tc.app, bob, friendshipId)

      // 6. Verify both are now friends
      const aliceFriends = await listFriends(tc.app, alice)
      const bobFriends = await listFriends(tc.app, bob)

      expect(aliceFriends).toHaveLength(1)
      expect(bobFriends).toHaveLength(1)
      expect((aliceFriends[0] as any).clawId).toBe(bob.clawId)
      expect((bobFriends[0] as any).clawId).toBe(alice.clawId)

      // 7. Alice sends direct message to Bob
      const messageId = await sendDirectMessage(tc.app, alice, bob, 'Hi Bob! 👋')

      expect(messageId).toBeTruthy()

      // 8. Bob checks inbox and sees the message
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      const inboxEntry = bobInbox[0] as any
      expect(inboxEntry.message.fromClawId).toBe(alice.clawId)
      expect(inboxEntry.message.blocks).toHaveLength(1)
      expect(inboxEntry.message.blocks[0].type).toBe('text')
      expect(inboxEntry.message.blocks[0].text).toBe('Hi Bob! 👋')
      expect(inboxEntry.message.visibility).toBe('direct')

      // 9. Bob adds a reaction to the message
      await addReaction(tc.app, bob, messageId, '👍')

      // 10. Alice views reactions on her message
      const reactions = await getReactions(tc.app, alice, messageId)
      expect(reactions).toHaveLength(1)
      expect((reactions[0] as any).emoji).toBe('👍')
      expect((reactions[0] as any).count).toBe(1)
      expect((reactions[0] as any).clawIds).toContain(bob.clawId)

      // 11. Bob sends a reply
      const replyId = await sendDirectMessage(tc.app, bob, alice, 'Hey Alice! How are you?')

      // 12. Alice checks her inbox
      const aliceInbox = await getInbox(tc.app, alice)
      expect(aliceInbox).toHaveLength(1)

      const aliceEntry = aliceInbox[0] as any
      expect(aliceEntry.message.id).toBe(replyId)
      expect(aliceEntry.message.blocks[0].text).toBe('Hey Alice! How are you?')
    })

    it('should prevent messaging non-friends', async () => {
      // Alice tries to send message to Bob without being friends
      let errorThrown = false
      try {
        await sendDirectMessage(tc.app, alice, bob, 'Hello stranger')
      } catch (err) {
        errorThrown = true
        expect((err as Error).message).toContain('failed')
      }

      expect(errorThrown).toBe(true)

      // Bob's inbox should be empty
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(0)
    })

    it('should handle friend removal and message access', async () => {
      // 1. Become friends and exchange messages
      await makeFriends(tc.app, alice, bob)

      const messageId1 = await sendDirectMessage(tc.app, alice, bob, 'Message before unfriend')

      // Verify Bob received the message
      let bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      // 2. Alice removes Bob as friend
      await removeFriend(tc.app, alice, bob.clawId)

      // 3. Verify they are no longer friends
      const aliceFriends = await listFriends(tc.app, alice)
      const bobFriends = await listFriends(tc.app, bob)

      expect(aliceFriends).toHaveLength(0)
      expect(bobFriends).toHaveLength(0)

      // 4. Verify Bob can still access historical message
      const message = await getMessage(tc.app, bob, messageId1)
      expect((message as any).blocks[0].text).toBe('Message before unfriend')

      // 5. Verify Alice cannot send new messages
      let errorThrown = false
      try {
        await sendDirectMessage(tc.app, alice, bob, 'New message after unfriend')
      } catch (err) {
        errorThrown = true
      }

      expect(errorThrown).toBe(true)

      // 6. Bob's inbox should still have only the old message
      bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)
    })

    it('should support multiple reactions on same message', async () => {
      await makeFriends(tc.app, alice, bob)

      const messageId = await sendDirectMessage(tc.app, alice, bob, 'Great news!')

      // Bob adds multiple reactions
      await addReaction(tc.app, bob, messageId, '🎉')
      await addReaction(tc.app, bob, messageId, '❤️')
      await addReaction(tc.app, bob, messageId, '🔥')

      // Alice views all reactions
      const reactions = await getReactions(tc.app, alice, messageId)
      expect(reactions).toHaveLength(3)

      const emojis = (reactions as any[]).map((r) => r.emoji)
      expect(emojis).toContain('🎉')
      expect(emojis).toContain('❤️')
      expect(emojis).toContain('🔥')

      // Verify Bob is the reactor for all
      reactions.forEach((r: any) => {
        expect(r.clawIds).toContain(bob.clawId)
      })
    })

    it('should allow bidirectional messaging', async () => {
      await makeFriends(tc.app, alice, bob)

      // Alice sends to Bob
      const msg1 = await sendDirectMessage(tc.app, alice, bob, 'Message from Alice')

      // Bob sends to Alice
      const msg2 = await sendDirectMessage(tc.app, bob, alice, 'Message from Bob')

      // Verify both received messages
      const aliceInbox = await getInbox(tc.app, alice)
      const bobInbox = await getInbox(tc.app, bob)

      expect(aliceInbox).toHaveLength(1)
      expect(bobInbox).toHaveLength(1)

      expect((aliceInbox[0] as any).message.id).toBe(msg2)
      expect((bobInbox[0] as any).message.id).toBe(msg1)
    })
  })

  describe('Auto-Accept Reverse Request', () => {
    it('should auto-accept when both users send requests simultaneously', async () => {
      // 1. Alice sends request to Bob
      await sendFriendRequest(tc.app, alice, bob)

      // 2. Bob also sends request to Alice (should auto-accept)
      const friendshipId = await sendFriendRequest(tc.app, bob, alice)
      expect(friendshipId).toBeTruthy()

      // 3. Verify both are immediately friends (auto-accepted)
      const aliceFriends = await listFriends(tc.app, alice)
      const bobFriends = await listFriends(tc.app, bob)

      expect(aliceFriends).toHaveLength(1)
      expect(bobFriends).toHaveLength(1)

      // 4. Neither should have pending requests
      const alicePending = await getPendingRequests(tc.app, alice)
      const bobPending = await getPendingRequests(tc.app, bob)

      expect(alicePending).toHaveLength(0)
      expect(bobPending).toHaveLength(0)

      // 5. Verify they can immediately message each other
      const messageId = await sendDirectMessage(tc.app, alice, bob, 'We are friends now!')

      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)
      expect((bobInbox[0] as any).message.blocks[0].text).toBe('We are friends now!')
    })
  })

  describe('Multiple Friends Scenario', () => {
    it('should manage multiple friendships independently', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')
      const david = await registerClaw(tc.app, 'David')

      // Alice becomes friends with Bob, Charlie, and David
      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)
      await makeFriends(tc.app, alice, david)

      // Verify Alice has 3 friends
      const aliceFriends = await listFriends(tc.app, alice)
      expect(aliceFriends).toHaveLength(3)

      // Alice sends different messages to each friend
      const msgBob = await sendDirectMessage(tc.app, alice, bob, 'Hi Bob')
      const msgCharlie = await sendDirectMessage(tc.app, alice, charlie, 'Hi Charlie')
      const msgDavid = await sendDirectMessage(tc.app, alice, david, 'Hi David')

      // Verify each friend only sees their own message
      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)
      const davidInbox = await getInbox(tc.app, david)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(1)
      expect(davidInbox).toHaveLength(1)

      expect((bobInbox[0] as any).message.id).toBe(msgBob)
      expect((charlieInbox[0] as any).message.id).toBe(msgCharlie)
      expect((davidInbox[0] as any).message.id).toBe(msgDavid)

      // Bob and Charlie cannot see each other's messages from Alice
      expect((bobInbox[0] as any).message.blocks[0].text).toBe('Hi Bob')
      expect((charlieInbox[0] as any).message.blocks[0].text).toBe('Hi Charlie')

      // Alice removes Charlie
      await removeFriend(tc.app, alice, charlie.clawId)

      // Verify Alice now has 2 friends
      const aliceFriendsAfter = await listFriends(tc.app, alice)
      expect(aliceFriendsAfter).toHaveLength(2)

      // Alice can still message Bob and David
      await sendDirectMessage(tc.app, alice, bob, 'Second message')
      await sendDirectMessage(tc.app, alice, david, 'Second message')

      // But cannot message Charlie
      let errorThrown = false
      try {
        await sendDirectMessage(tc.app, alice, charlie, 'After unfriend')
      } catch (err) {
        errorThrown = true
      }

      expect(errorThrown).toBe(true)
    })
  })

  describe('Message Visibility and Privacy', () => {
    it('should ensure messages are only visible to recipients', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      // Alice and Bob are friends
      await makeFriends(tc.app, alice, bob)

      // Charlie is not friends with anyone
      // Alice sends message to Bob
      const messageId = await sendDirectMessage(tc.app, alice, bob, 'Private message')

      // Charlie tries to access the message
      let errorThrown = false
      try {
        await getMessage(tc.app, charlie, messageId)
      } catch (err) {
        errorThrown = true
      }

      expect(errorThrown).toBe(true)

      // Charlie's inbox should be empty
      const charlieInbox = await getInbox(tc.app, charlie)
      expect(charlieInbox).toHaveLength(0)
    })

    it('should allow reactions only from message recipients', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      await makeFriends(tc.app, alice, bob)

      const messageId = await sendDirectMessage(tc.app, alice, bob, 'Test message')

      // Bob (recipient) can add reaction
      await addReaction(tc.app, bob, messageId, '👍')

      // Charlie (non-recipient) cannot add reaction
      let errorThrown = false
      try {
        await addReaction(tc.app, charlie, messageId, '❤️')
      } catch (err) {
        errorThrown = true
      }

      expect(errorThrown).toBe(true)

      // Verify only Bob's reaction exists
      const reactions = await getReactions(tc.app, alice, messageId)
      expect(reactions).toHaveLength(1)
      expect((reactions[0] as any).clawIds).toContain(bob.clawId)
    })
  })
})
