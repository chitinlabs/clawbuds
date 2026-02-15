/**
 * E2E Test: Group Messaging Flow
 *
 * CRITICAL PRIORITY
 *
 * Tests the complete group messaging lifecycle:
 * 1. Alice creates a group
 * 2. Alice invites Bob and Charlie
 * 3. Bob and Charlie accept invitations
 * 4. Alice sends a group message
 * 5. All members receive the message
 * 6. Encrypted group messaging works
 *
 * Also covers: non-member restrictions, message history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

import {
  type TestContext,
  type TestClaw,
  createTestContext,
  destroyTestContext,
  registerClaw,
  signedHeaders,
  createGroup,
  inviteToGroup,
  joinGroup,
  sendGroupMessage,
  getInbox,
} from './helpers.js'

describe('E2E: Group Messaging Flow', () => {
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

  describe('Complete Group Messaging Lifecycle', () => {
    it('should deliver group message to all members', async () => {
      // Step 1: Alice creates group
      const groupId = await createGroup(tc.app, alice, {
        name: 'Project Team',
      })

      // Step 2: Alice invites Bob and Charlie
      await inviteToGroup(tc.app, groupId, alice, bob)
      await inviteToGroup(tc.app, groupId, alice, charlie)

      // Step 3: Both check pending invitations
      const bobInvH = signedHeaders(
        'GET',
        '/api/v1/groups/invitations',
        bob.clawId,
        bob.keys.privateKey,
      )
      const bobInvRes = await request(tc.app)
        .get('/api/v1/groups/invitations')
        .set(bobInvH)

      expect(bobInvRes.status).toBe(200)
      expect(bobInvRes.body.data).toHaveLength(1)
      expect(bobInvRes.body.data[0].groupName).toBe('Project Team')
      expect(bobInvRes.body.data[0].inviterId).toBe(alice.clawId)

      // Step 4: Bob and Charlie accept invitations
      await joinGroup(tc.app, groupId, bob)
      await joinGroup(tc.app, groupId, charlie)

      // Step 5: Verify all 3 members are listed
      const membersH = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}/members`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const membersRes = await request(tc.app)
        .get(`/api/v1/groups/${groupId}/members`)
        .set(membersH)

      expect(membersRes.status).toBe(200)
      expect(membersRes.body.data).toHaveLength(3)

      const roles = membersRes.body.data.map(
        (m: { role: string }) => m.role,
      )
      expect(roles).toContain('owner')
      expect(roles.filter((r: string) => r === 'member')).toHaveLength(2)

      // Step 6: Alice sends a group message
      const { messageId, recipientCount } = await sendGroupMessage(
        tc.app,
        groupId,
        alice,
        'Welcome to the team!',
      )

      expect(messageId).toBeTruthy()
      expect(recipientCount).toBe(2) // Bob and Charlie (not Alice herself)

      // Step 7: Verify Bob received the message
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      const bobMsg = bobInbox[0] as {
        message: {
          fromClawId: string
          blocks: Array<{ text: string }>
        }
      }
      expect(bobMsg.message.fromClawId).toBe(alice.clawId)
      expect(bobMsg.message.blocks[0].text).toBe('Welcome to the team!')

      // Step 8: Verify Charlie received the message
      const charlieInbox = await getInbox(tc.app, charlie)
      expect(charlieInbox).toHaveLength(1)

      const charlieMsg = charlieInbox[0] as {
        message: {
          fromClawId: string
          blocks: Array<{ text: string }>
        }
      }
      expect(charlieMsg.message.fromClawId).toBe(alice.clawId)
      expect(charlieMsg.message.blocks[0].text).toBe('Welcome to the team!')

      // Step 9: Alice should NOT receive her own message
      const aliceInbox = await getInbox(tc.app, alice)
      expect(aliceInbox).toHaveLength(0)
    })

    it('should support multi-sender conversation in group', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Chat Room',
        type: 'public',
      })

      // Bob and Charlie join the public group
      await joinGroup(tc.app, groupId, bob)
      await joinGroup(tc.app, groupId, charlie)

      // Alice sends message
      await sendGroupMessage(tc.app, groupId, alice, 'Hello everyone!')

      // Bob replies
      await sendGroupMessage(tc.app, groupId, bob, 'Hey Alice!')

      // Charlie replies
      await sendGroupMessage(tc.app, groupId, charlie, 'Hi all!')

      // Check message history
      const historyH = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}/messages`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const historyRes = await request(tc.app)
        .get(`/api/v1/groups/${groupId}/messages`)
        .set(historyH)

      expect(historyRes.status).toBe(200)
      expect(historyRes.body.data).toHaveLength(3)

      // Messages are returned in DESC order (newest first)
      const senders = historyRes.body.data.map(
        (m: { fromClawId: string }) => m.fromClawId,
      )
      expect(senders).toContain(alice.clawId)
      expect(senders).toContain(bob.clawId)
      expect(senders).toContain(charlie.clawId)
    })

    it('should deliver messages only to current members', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Dynamic Group',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Alice sends first message -- only Bob receives
      const { recipientCount: count1 } = await sendGroupMessage(
        tc.app,
        groupId,
        alice,
        'Message before Charlie',
      )
      expect(count1).toBe(1)

      // Charlie joins
      await joinGroup(tc.app, groupId, charlie)

      // Alice sends second message -- Bob AND Charlie receive
      const { recipientCount: count2 } = await sendGroupMessage(
        tc.app,
        groupId,
        alice,
        'Message after Charlie joined',
      )
      expect(count2).toBe(2)

      // Bob's inbox has both messages
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(2)

      // Charlie's inbox has only the second message
      const charlieInbox = await getInbox(tc.app, charlie)
      expect(charlieInbox).toHaveLength(1)
      const charlieMsg = charlieInbox[0] as {
        message: { blocks: Array<{ text: string }> }
      }
      expect(charlieMsg.message.blocks[0].text).toBe(
        'Message after Charlie joined',
      )
    })
  })

  describe('Non-Member Restrictions', () => {
    it('should prevent non-member from sending messages', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Private Group',
      })

      const msgBody = { blocks: [{ type: 'text', text: 'Sneaky message' }] }
      const h = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
        msgBody,
      )
      const res = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/messages`)
        .set(h)
        .send(msgBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_MEMBER')
    })

    it('should prevent non-member from reading message history', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Private Group',
      })

      // Send a message so there's history
      await sendGroupMessage(tc.app, groupId, alice, 'Secret info')

      // Bob (not a member) tries to read history
      const h = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res = await request(tc.app)
        .get(`/api/v1/groups/${groupId}/messages`)
        .set(h)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_MEMBER')
    })

    it('should block messages after member is removed', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Removable Group',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Alice sends message -- Bob receives
      await sendGroupMessage(tc.app, groupId, alice, 'Before removal')
      const bobInbox1 = await getInbox(tc.app, bob)
      expect(bobInbox1).toHaveLength(1)

      // Alice removes Bob
      const removeH = signedHeaders(
        'DELETE',
        `/api/v1/groups/${groupId}/members/${bob.clawId}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const removeRes = await request(tc.app)
        .delete(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
        .set(removeH)

      expect(removeRes.status).toBe(200)

      // Alice sends another message -- Bob should NOT receive
      await sendGroupMessage(tc.app, groupId, alice, 'After removal')

      // Bob still has only 1 message from before removal
      const bobInbox2 = await getInbox(tc.app, bob)
      expect(bobInbox2).toHaveLength(1)

      // Bob cannot send messages anymore
      const msgBody = { blocks: [{ type: 'text', text: 'Cannot send' }] }
      const sendH = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
        msgBody,
      )
      const sendRes = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/messages`)
        .set(sendH)
        .send(msgBody)

      expect(sendRes.status).toBe(403)
    })

    it('should block messages after member leaves', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Leave Group',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Bob leaves
      const leaveH = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/leave`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const leaveRes = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/leave`)
        .set(leaveH)

      expect(leaveRes.status).toBe(200)

      // Bob cannot send messages
      const msgBody = { blocks: [{ type: 'text', text: 'Cannot send' }] }
      const sendH = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
        msgBody,
      )
      const sendRes = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/messages`)
        .set(sendH)
        .send(msgBody)

      expect(sendRes.status).toBe(403)
    })
  })

  describe('Encrypted Group Messages', () => {
    it('should support encrypted flag on group creation', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Encrypted Group',
        encrypted: true,
      })

      // Verify group is marked as encrypted
      const detailH = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const detailRes = await request(tc.app)
        .get(`/api/v1/groups/${groupId}`)
        .set(detailH)

      expect(detailRes.status).toBe(200)
      expect(detailRes.body.data.encrypted).toBe(true)
    })

    it('should support sending encrypted content in group messages', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'E2EE Group',
        encrypted: true,
      })

      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)

      // Alice sends an "encrypted" message (the encryption happens client-side)
      const encryptedPayload = JSON.stringify({
        e2ee: true,
        ciphertext: 'base64EncodedCiphertext==',
        nonce: 'base64Nonce==',
        keyGeneration: 1,
      })

      const msgBody = {
        blocks: [{ type: 'text', text: encryptedPayload }],
      }
      const h = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/messages`,
        alice.clawId,
        alice.keys.privateKey,
        msgBody,
      )
      const res = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/messages`)
        .set(h)
        .send(msgBody)

      expect(res.status).toBe(201)

      // Bob receives the encrypted payload as-is (server does not decrypt)
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      const receivedText = (
        bobInbox[0] as { message: { blocks: Array<{ text: string }> } }
      ).message.blocks[0].text
      const parsedPayload = JSON.parse(receivedText) as {
        e2ee: boolean
        ciphertext: string
      }

      expect(parsedPayload.e2ee).toBe(true)
      expect(parsedPayload.ciphertext).toBe('base64EncodedCiphertext==')
    })
  })

  describe('Message History and Pagination', () => {
    it('should return messages in reverse chronological order', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'History Group',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Send 5 messages
      for (let i = 1; i <= 5; i++) {
        await sendGroupMessage(tc.app, groupId, alice, `Message ${i}`)
      }

      // Get history
      const h = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res = await request(tc.app)
        .get(`/api/v1/groups/${groupId}/messages`)
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(5)

      // Newest message first
      const texts = res.body.data.map(
        (m: { blocks: Array<{ text: string }> }) => m.blocks[0].text,
      )
      expect(texts[0]).toBe('Message 5')
      expect(texts[4]).toBe('Message 1')
    })

    it('should support limit parameter for pagination', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Paginated Group',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Send 10 messages
      for (let i = 1; i <= 10; i++) {
        await sendGroupMessage(tc.app, groupId, alice, `Msg ${i}`)
      }

      // Get only first 3
      const h = signedHeaders(
        'GET',
        `/api/v1/groups/${groupId}/messages`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res = await request(tc.app)
        .get(`/api/v1/groups/${groupId}/messages?limit=3`)
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
    })
  })
})
