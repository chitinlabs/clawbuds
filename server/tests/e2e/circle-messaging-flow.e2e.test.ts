/**
 * E2E Test: Circle Creation to Group Messaging Flow
 *
 * Tests the complete Circle messaging journey across multiple services:
 * - IClawRepository: User registration
 * - IFriendshipRepository: Friend validation
 * - CircleService: Circle creation and management
 * - IMessageRepository: Circle message distribution
 *
 * This test validates selective group communication:
 * Create Circle → Add Friends → Send Circle Message → Verify Selective Delivery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TestContext, TestClaw } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  registerClaw,
  makeFriends,
  createCircle,
  addFriendToCircle,
  sendCircleMessage,
  getInbox,
  addReaction,
  getReactions,
} from './helpers.js'

describe('E2E: Circle Creation to Group Messaging Flow', () => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw
  let charlie: TestClaw

  beforeEach(async () => {
    tc = createTestContext()
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    charlie = await registerClaw(tc.app, 'Charlie')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('Complete Circle Journey', () => {
    it('should complete: create circle → add friends → send message → verify selective delivery', async () => {
      // 1. Alice becomes friends with Bob and Charlie
      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)

      // 2. Alice creates a Circle called "Work Friends"
      const circleId = await createCircle(tc.app, alice, {
        name: 'Work Friends',
        description: 'My work colleagues',
      })

      expect(circleId).toBeTruthy()

      // 3. Alice adds only Bob to the Circle (not Charlie)
      await addFriendToCircle(tc.app, alice, circleId, bob.clawId)

      // 4. Alice sends a Circle message to "Work Friends"
      const messageId = await sendCircleMessage(
        tc.app,
        alice,
        ['Work Friends'],
        'Team meeting at 3pm today!',
      )

      expect(messageId).toBeTruthy()

      // 5. Verify Bob received the message
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      const bobEntry = bobInbox[0] as any
      expect(bobEntry.message.id).toBe(messageId)
      expect(bobEntry.message.fromClawId).toBe(alice.clawId)
      expect(bobEntry.message.blocks[0].text).toBe('Team meeting at 3pm today!')
      expect(bobEntry.message.visibility).toBe('circles')

      // 6. Verify Charlie did NOT receive the message (not in Circle)
      const charlieInbox = await getInbox(tc.app, charlie)
      expect(charlieInbox).toHaveLength(0)

      // 7. Alice adds Charlie to the Circle
      await addFriendToCircle(tc.app, alice, circleId, charlie.clawId)

      // 8. Alice sends another Circle message
      const messageId2 = await sendCircleMessage(
        tc.app,
        alice,
        ['Work Friends'],
        'Welcome Charlie to the team!',
      )

      // 9. Verify both Bob and Charlie received the new message
      const bobInbox2 = await getInbox(tc.app, bob)
      const charlieInbox2 = await getInbox(tc.app, charlie)

      expect(bobInbox2).toHaveLength(2)
      expect(charlieInbox2).toHaveLength(1)

      expect((bobInbox2[1] as any).message.id).toBe(messageId2)
      expect((charlieInbox2[0] as any).message.id).toBe(messageId2)
      expect((charlieInbox2[0] as any).message.blocks[0].text).toBe('Welcome Charlie to the team!')

      // 10. Bob adds a reaction
      await addReaction(tc.app, bob, messageId2, '👋')

      // 11. Alice views reactions
      const reactions = await getReactions(tc.app, alice, messageId2)
      expect(reactions).toHaveLength(1)
      expect((reactions[0] as any).emoji).toBe('👋')
      expect((reactions[0] as any).count).toBe(1)
      expect((reactions[0] as any).clawIds).toContain(bob.clawId)
    })

    it('should prevent adding non-friend to circle', async () => {
      // Alice is friends with Bob but not Charlie
      await makeFriends(tc.app, alice, bob)

      // Alice creates a Circle
      const circleId = await createCircle(tc.app, alice, {
        name: 'Friends Only',
      })

      // Alice can add Bob (friend)
      await addFriendToCircle(tc.app, alice, circleId, bob.clawId)

      // Alice cannot add Charlie (non-friend)
      let errorThrown = false
      try {
        await addFriendToCircle(tc.app, alice, circleId, charlie.clawId)
      } catch (err) {
        errorThrown = true
        expect((err as Error).message).toContain('failed')
      }

      expect(errorThrown).toBe(true)

      // Verify only Bob gets messages
      await sendCircleMessage(tc.app, alice, ['Friends Only'], 'Test message')

      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(0)
    })

    it('should handle multiple circles with overlapping members', async () => {
      const david = await registerClaw(tc.app, 'David')

      // Alice befriends everyone
      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)
      await makeFriends(tc.app, alice, david)

      // Alice creates two Circles
      const workId = await createCircle(tc.app, alice, { name: 'Work' })
      const familyId = await createCircle(tc.app, alice, { name: 'Family' })

      // Work Circle: Bob and Charlie
      await addFriendToCircle(tc.app, alice, workId, bob.clawId)
      await addFriendToCircle(tc.app, alice, workId, charlie.clawId)

      // Family Circle: Charlie and David
      await addFriendToCircle(tc.app, alice, familyId, charlie.clawId)
      await addFriendToCircle(tc.app, alice, familyId, david.clawId)

      // Alice sends Work message
      const workMsg = await sendCircleMessage(tc.app, alice, ['Work'], 'Work update: Project deadline extended')

      // Alice sends Family message
      const familyMsg = await sendCircleMessage(tc.app, alice, ['Family'], 'Family dinner this Sunday!')

      // Verify delivery:
      // - Bob: Only Work message
      // - Charlie: Both Work and Family messages
      // - David: Only Family message

      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)
      const davidInbox = await getInbox(tc.app, david)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(2)
      expect(davidInbox).toHaveLength(1)

      expect((bobInbox[0] as any).message.id).toBe(workMsg)
      expect((bobInbox[0] as any).message.blocks[0].text).toContain('Work update')

      expect((davidInbox[0] as any).message.id).toBe(familyMsg)
      expect((davidInbox[0] as any).message.blocks[0].text).toContain('Family dinner')

      // Charlie received both
      const charlieMessageIds = (charlieInbox as any[]).map((entry) => entry.message.id)
      expect(charlieMessageIds).toContain(workMsg)
      expect(charlieMessageIds).toContain(familyMsg)
    })

    it('should support sending to multiple circles simultaneously', async () => {
      const david = await registerClaw(tc.app, 'David')

      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)
      await makeFriends(tc.app, alice, david)

      // Create two Circles
      const workId = await createCircle(tc.app, alice, { name: 'Work' })
      const friendsId = await createCircle(tc.app, alice, { name: 'Friends' })

      // Work: Bob and Charlie
      await addFriendToCircle(tc.app, alice, workId, bob.clawId)
      await addFriendToCircle(tc.app, alice, workId, charlie.clawId)

      // Friends: Charlie and David
      await addFriendToCircle(tc.app, alice, friendsId, charlie.clawId)
      await addFriendToCircle(tc.app, alice, friendsId, david.clawId)

      // Alice sends message to BOTH Circles at once
      const messageId = await sendCircleMessage(
        tc.app,
        alice,
        ['Work', 'Friends'],
        'Important announcement for everyone!',
      )

      // Verify delivery:
      // - Bob: 1 message (Work only)
      // - Charlie: 1 message (Work + Friends, but deduplicated)
      // - David: 1 message (Friends only)

      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)
      const davidInbox = await getInbox(tc.app, david)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(1) // Deduplicated - not 2
      expect(davidInbox).toHaveLength(1)

      // All received the same message
      expect((bobInbox[0] as any).message.id).toBe(messageId)
      expect((charlieInbox[0] as any).message.id).toBe(messageId)
      expect((davidInbox[0] as any).message.id).toBe(messageId)

      // All see the same content
      expect((bobInbox[0] as any).message.blocks[0].text).toBe('Important announcement for everyone!')
      expect((charlieInbox[0] as any).message.blocks[0].text).toBe('Important announcement for everyone!')
      expect((davidInbox[0] as any).message.blocks[0].text).toBe('Important announcement for everyone!')
    })

    it('should handle empty circles (no messages sent)', async () => {
      // Alice creates a Circle but doesn't add anyone
      const circleId = await createCircle(tc.app, alice, {
        name: 'Empty Circle',
      })

      // Alice sends message to empty Circle
      const messageId = await sendCircleMessage(tc.app, alice, ['Empty Circle'], 'Hello empty void!')

      expect(messageId).toBeTruthy()

      // No one receives the message (Circle is empty)
      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)

      expect(bobInbox).toHaveLength(0)
      expect(charlieInbox).toHaveLength(0)
    })

    it('should allow Circle members to react to messages', async () => {
      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)

      const circleId = await createCircle(tc.app, alice, { name: 'Team' })
      await addFriendToCircle(tc.app, alice, circleId, bob.clawId)
      await addFriendToCircle(tc.app, alice, circleId, charlie.clawId)

      const messageId = await sendCircleMessage(tc.app, alice, ['Team'], 'Great work everyone! 🎉')

      // Both Circle members react
      await addReaction(tc.app, bob, messageId, '🎉')
      await addReaction(tc.app, charlie, messageId, '🔥')

      // Alice views all reactions
      const reactions = await getReactions(tc.app, alice, messageId)
      expect(reactions).toHaveLength(2)

      const emojis = (reactions as any[]).map((r) => r.emoji)
      expect(emojis).toContain('🎉')
      expect(emojis).toContain('🔥')

      // Verify Bob and Charlie each reacted once
      const fireReaction = (reactions as any[]).find((r) => r.emoji === '🔥')
      const celebrateReaction = (reactions as any[]).find((r) => r.emoji === '🎉')

      expect(celebrateReaction?.clawIds).toContain(bob.clawId)
      expect(fireReaction?.clawIds).toContain(charlie.clawId)
    })
  })

  describe('Circle Name Resolution', () => {
    it('should handle non-existent circle names gracefully', async () => {
      await makeFriends(tc.app, alice, bob)

      // Alice tries to send message to Circle that doesn't exist
      let errorThrown = false
      try {
        await sendCircleMessage(tc.app, alice, ['NonExistentCircle'], 'Hello?')
      } catch (err) {
        errorThrown = true
      }

      // Depending on implementation, this might succeed but send to 0 recipients
      // or it might fail. Either is acceptable.
      // For now, we just verify Bob doesn't receive anything unexpected
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(0)
    })

    it('should prevent creating circles with duplicate names', async () => {
      // Alice creates a Circle
      const circle1 = await createCircle(tc.app, alice, { name: 'Friends' })
      expect(circle1).toBeTruthy()

      // Alice tries to create another Circle with the same name
      // Should fail due to UNIQUE constraint on (owner_id, name)
      let errorThrown = false
      try {
        await createCircle(tc.app, alice, { name: 'Friends' })
      } catch (err) {
        errorThrown = true
        expect((err as Error).message).toContain('failed')
      }

      expect(errorThrown).toBe(true)

      // Different user (Bob) can create Circle with same name
      const bobCircle = await createCircle(tc.app, bob, { name: 'Friends' })
      expect(bobCircle).toBeTruthy()
    })
  })

  describe('Circle and Direct Message Interaction', () => {
    it('should allow mixing Circle and Direct messages', async () => {
      await makeFriends(tc.app, alice, bob)
      await makeFriends(tc.app, alice, charlie)

      const circleId = await createCircle(tc.app, alice, { name: 'Work' })
      await addFriendToCircle(tc.app, alice, circleId, bob.clawId)
      await addFriendToCircle(tc.app, alice, circleId, charlie.clawId)

      // Alice sends Circle message
      const circleMsg = await sendCircleMessage(tc.app, alice, ['Work'], 'Team update')

      // Alice sends Direct message to Bob only
      const { sendDirectMessage } = await import('./helpers.js')
      const directMsg = await sendDirectMessage(tc.app, alice, bob, 'Private note for Bob')

      // Verify Bob's inbox
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(2)

      const bobMessages = (bobInbox as any[]).map((entry) => ({
        id: entry.message.id,
        text: entry.message.blocks[0].text,
        visibility: entry.message.visibility,
      }))

      // Bob received both Circle and Direct messages
      const circleEntry = bobMessages.find((m) => m.id === circleMsg)
      const directEntry = bobMessages.find((m) => m.id === directMsg)

      expect(circleEntry).toBeDefined()
      expect(circleEntry?.visibility).toBe('circles')
      expect(circleEntry?.text).toBe('Team update')

      expect(directEntry).toBeDefined()
      expect(directEntry?.visibility).toBe('direct')
      expect(directEntry?.text).toBe('Private note for Bob')

      // Verify Charlie's inbox (only Circle message)
      const charlieInbox = await getInbox(tc.app, charlie)
      expect(charlieInbox).toHaveLength(1)
      expect((charlieInbox[0] as any).message.id).toBe(circleMsg)
    })
  })
})
