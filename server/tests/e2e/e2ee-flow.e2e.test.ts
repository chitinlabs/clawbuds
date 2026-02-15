/**
 * E2E Test: End-to-End Encrypted Message Flow
 *
 * CRITICAL PRIORITY
 *
 * Tests the complete E2EE lifecycle:
 * 1. Alice and Bob register E2EE keys
 * 2. Alice encrypts a message using Bob's public key
 * 3. Alice sends the encrypted message via the API
 * 4. Bob retrieves the message from inbox
 * 5. Bob decrypts the message using the shared secret
 * 6. Server cannot read the plaintext
 *
 * Also covers: key rotation, batch key queries, group sender keys.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import {
  x25519SharedSecret,
  deriveSessionKey,
  aesEncrypt,
  aesDecrypt,
} from '@clawbuds/shared'

import {
  type TestContext,
  type TestClaw,
  createTestContext,
  destroyTestContext,
  registerClaw,
  signedHeaders,
  makeFriends,
  registerE2eeKey,
  encryptMessage,
  decryptMessage,
  createGroup,
  inviteToGroup,
  joinGroup,
  sendGroupMessage,
  getInbox,
  sendDirectMessage,
} from './helpers.js'

describe('E2E: Encrypted Message Flow', () => {
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

  describe('Complete E2EE Lifecycle', () => {
    it('should complete full encrypted message exchange between Alice and Bob', async () => {
      // Step 1: Both users enable E2EE by registering X25519 keys
      await registerE2eeKey(tc.app, alice)
      await registerE2eeKey(tc.app, bob)

      // Step 2: Establish friendship (required for DMs)
      await makeFriends(tc.app, alice, bob)

      // Step 3: Alice fetches Bob's public key
      const fetchKeyH = signedHeaders(
        'GET',
        `/api/v1/e2ee/keys/${bob.clawId}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const keyRes = await request(tc.app)
        .get(`/api/v1/e2ee/keys/${bob.clawId}`)
        .set(fetchKeyH)

      expect(keyRes.status).toBe(200)
      expect(keyRes.body.data.x25519PublicKey).toBe(bob.x25519Public)

      // Step 4: Alice encrypts a message for Bob using ECDH shared secret
      const secretMessage = 'This is a top-secret message from Alice to Bob!'
      const encrypted = await encryptMessage(
        alice.x25519Private,
        bob.x25519Public,
        secretMessage,
      )

      // Step 5: Alice sends the encrypted message (server sees only ciphertext)
      const encryptedBlock = {
        type: 'text',
        text: JSON.stringify({
          e2ee: true,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          senderFingerprint: alice.x25519Public.slice(0, 16),
        }),
      }

      const msgBody = {
        blocks: [encryptedBlock],
        visibility: 'direct',
        toClawIds: [bob.clawId],
      }
      const sendH = signedHeaders(
        'POST',
        '/api/v1/messages',
        alice.clawId,
        alice.keys.privateKey,
        msgBody,
      )
      const sendRes = await request(tc.app)
        .post('/api/v1/messages')
        .set(sendH)
        .send(msgBody)

      expect(sendRes.status).toBe(201)
      expect(sendRes.body.data.recipientCount).toBe(1)

      // Step 6: Verify server stores only ciphertext (cannot read plaintext)
      const storedMessageId = sendRes.body.data.messageId
      const serverViewH = signedHeaders(
        'GET',
        `/api/v1/messages/${storedMessageId}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const serverViewRes = await request(tc.app)
        .get(`/api/v1/messages/${storedMessageId}`)
        .set(serverViewH)

      expect(serverViewRes.status).toBe(200)
      const storedText = serverViewRes.body.data.blocks[0].text
      // Server sees the JSON envelope, not the plaintext
      expect(storedText).toContain('ciphertext')
      expect(storedText).not.toContain(secretMessage)

      // Step 7: Bob retrieves from inbox
      const inbox = await getInbox(tc.app, bob)
      expect(inbox).toHaveLength(1)
      const inboxEntry = inbox[0] as {
        message: { blocks: Array<{ text: string }> }
      }
      const receivedText = inboxEntry.message.blocks[0].text
      const receivedEnvelope = JSON.parse(receivedText) as {
        e2ee: boolean
        ciphertext: string
        nonce: string
      }

      expect(receivedEnvelope.e2ee).toBe(true)

      // Step 8: Bob decrypts the message
      const decryptedMessage = await decryptMessage(
        bob.x25519Private,
        alice.x25519Public,
        receivedEnvelope.ciphertext,
        receivedEnvelope.nonce,
      )

      expect(decryptedMessage).toBe(secretMessage)
    })

    it('should handle bidirectional encrypted conversation', async () => {
      await registerE2eeKey(tc.app, alice)
      await registerE2eeKey(tc.app, bob)
      await makeFriends(tc.app, alice, bob)

      // Alice sends to Bob
      const msg1 = 'Hello Bob, this is secret!'
      const enc1 = await encryptMessage(
        alice.x25519Private,
        bob.x25519Public,
        msg1,
      )

      // Bob sends to Alice
      const msg2 = 'Hello Alice, received your secret!'
      const enc2 = await encryptMessage(
        bob.x25519Private,
        alice.x25519Public,
        msg2,
      )

      // Both can decrypt their respective messages
      const dec1 = await decryptMessage(
        bob.x25519Private,
        alice.x25519Public,
        enc1.ciphertext,
        enc1.nonce,
      )
      const dec2 = await decryptMessage(
        alice.x25519Private,
        bob.x25519Public,
        enc2.ciphertext,
        enc2.nonce,
      )

      expect(dec1).toBe(msg1)
      expect(dec2).toBe(msg2)
    })

    it('should prevent unauthorized decryption by third party', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      await registerE2eeKey(tc.app, alice)
      await registerE2eeKey(tc.app, bob)
      await registerE2eeKey(tc.app, charlie)

      // Alice encrypts for Bob
      const secretMsg = 'Only Bob should read this'
      const encrypted = await encryptMessage(
        alice.x25519Private,
        bob.x25519Public,
        secretMsg,
      )

      // Charlie tries to decrypt -- should fail because the shared
      // secret derived from Charlie's private key + Alice's public key
      // differs from the one derived from Alice's private key + Bob's public key.
      const charlieShared = x25519SharedSecret(
        charlie.x25519Private,
        alice.x25519Public,
      )
      const wrongSessionKey = await deriveSessionKey(
        charlieShared,
        'e2ee-session',
      )

      let decryptionFailed = false
      try {
        aesDecrypt(wrongSessionKey, encrypted.ciphertext, encrypted.nonce)
      } catch {
        decryptionFailed = true
      }

      expect(decryptionFailed).toBe(true)
    })
  })

  describe('Key Registration and Rotation', () => {
    it('should register, rotate, and verify key updates', async () => {
      // Step 1: Alice registers initial key
      await registerE2eeKey(tc.app, alice)

      // Step 2: Bob queries Alice's key
      const h1 = signedHeaders(
        'GET',
        `/api/v1/e2ee/keys/${alice.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res1 = await request(tc.app)
        .get(`/api/v1/e2ee/keys/${alice.clawId}`)
        .set(h1)

      expect(res1.status).toBe(200)
      expect(res1.body.data.x25519PublicKey).toBe(alice.x25519Public)
      expect(res1.body.data.rotatedAt).toBeNull()

      // Step 3: Alice rotates key (re-registers with same mechanism)
      const newKey = 'aa' + alice.x25519Public.slice(2) // Different key
      const rotateBody = { x25519PublicKey: newKey }
      const rotateH = signedHeaders(
        'POST',
        '/api/v1/e2ee/keys',
        alice.clawId,
        alice.keys.privateKey,
        rotateBody,
      )
      const rotateRes = await request(tc.app)
        .post('/api/v1/e2ee/keys')
        .set(rotateH)
        .send(rotateBody)

      expect(rotateRes.status).toBe(201)
      expect(rotateRes.body.data.x25519PublicKey).toBe(newKey)
      expect(rotateRes.body.data.rotatedAt).not.toBeNull()

      // Step 4: Bob queries again and gets updated key
      const h2 = signedHeaders(
        'GET',
        `/api/v1/e2ee/keys/${alice.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res2 = await request(tc.app)
        .get(`/api/v1/e2ee/keys/${alice.clawId}`)
        .set(h2)

      expect(res2.body.data.x25519PublicKey).toBe(newKey)
    })

    it('should batch query keys for multiple users', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      // Register keys for Alice and Bob (not Charlie)
      await registerE2eeKey(tc.app, alice)
      await registerE2eeKey(tc.app, bob)

      // Charlie batch-queries all three
      const batchBody = {
        clawIds: [alice.clawId, bob.clawId, charlie.clawId],
      }
      const h = signedHeaders(
        'POST',
        '/api/v1/e2ee/keys/batch',
        charlie.clawId,
        charlie.keys.privateKey,
        batchBody,
      )
      const res = await request(tc.app)
        .post('/api/v1/e2ee/keys/batch')
        .set(h)
        .send(batchBody)

      expect(res.status).toBe(200)
      // Only Alice and Bob have registered keys
      expect(res.body.data).toHaveLength(2)

      const returnedIds = res.body.data.map(
        (k: { clawId: string }) => k.clawId,
      )
      expect(returnedIds).toContain(alice.clawId)
      expect(returnedIds).toContain(bob.clawId)
      expect(returnedIds).not.toContain(charlie.clawId)
    })

    it('should delete key and disable E2EE', async () => {
      await registerE2eeKey(tc.app, alice)

      // Delete key
      const deleteH = signedHeaders(
        'DELETE',
        '/api/v1/e2ee/keys',
        alice.clawId,
        alice.keys.privateKey,
      )
      const deleteRes = await request(tc.app)
        .delete('/api/v1/e2ee/keys')
        .set(deleteH)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.data.deleted).toBe(true)

      // Verify key is gone
      const queryH = signedHeaders(
        'GET',
        `/api/v1/e2ee/keys/${alice.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const queryRes = await request(tc.app)
        .get(`/api/v1/e2ee/keys/${alice.clawId}`)
        .set(queryH)

      expect(queryRes.status).toBe(404)
    })
  })

  describe('Group E2EE with Sender Keys', () => {
    it('should complete group encrypted message flow', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      // Step 1: All users register E2EE keys
      await registerE2eeKey(tc.app, alice)
      await registerE2eeKey(tc.app, bob)
      await registerE2eeKey(tc.app, charlie)

      // Step 2: Alice creates encrypted group
      const groupId = await createGroup(tc.app, alice, {
        name: 'Secret Group',
        encrypted: true,
      })

      // Step 3: Invite and join
      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)
      await inviteToGroup(tc.app, groupId, alice, charlie)
      await joinGroup(tc.app, groupId, charlie)

      // Step 4: Alice uploads sender keys for Bob and Charlie
      //   In real usage, Alice encrypts her sender key with each member's X25519 public key
      const aliceSenderKeyPlain = 'alice-group-sender-key-material'

      const encKeyForBob = await encryptMessage(
        alice.x25519Private,
        bob.x25519Public,
        aliceSenderKeyPlain,
      )
      const encKeyForCharlie = await encryptMessage(
        alice.x25519Private,
        charlie.x25519Public,
        aliceSenderKeyPlain,
      )

      const uploadBody = {
        keys: [
          {
            recipientId: bob.clawId,
            encryptedKey: JSON.stringify(encKeyForBob),
          },
          {
            recipientId: charlie.clawId,
            encryptedKey: JSON.stringify(encKeyForCharlie),
          },
        ],
      }
      const uploadH = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        uploadBody,
      )
      const uploadRes = await request(tc.app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(uploadH)
        .send(uploadBody)

      expect(uploadRes.status).toBe(201)
      expect(uploadRes.body.data).toHaveLength(2)
      expect(uploadRes.body.data[0].keyGeneration).toBe(1)

      // Step 5: Bob retrieves his sender keys from the group
      const getKeysH = signedHeaders(
        'GET',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const keysRes = await request(tc.app)
        .get(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(getKeysH)

      expect(keysRes.status).toBe(200)
      expect(keysRes.body.data).toHaveLength(1)
      expect(keysRes.body.data[0].senderId).toBe(alice.clawId)

      // Step 6: Bob decrypts Alice's sender key
      const encryptedSenderKey = JSON.parse(
        keysRes.body.data[0].encryptedKey,
      ) as { ciphertext: string; nonce: string }

      const decryptedSenderKey = await decryptMessage(
        bob.x25519Private,
        alice.x25519Public,
        encryptedSenderKey.ciphertext,
        encryptedSenderKey.nonce,
      )

      expect(decryptedSenderKey).toBe(aliceSenderKeyPlain)

      // Step 7: Alice sends an encrypted group message
      // In real usage, Alice would encrypt with her sender key
      const groupMsg = 'Secret group message from Alice'
      const { messageId, recipientCount } = await sendGroupMessage(
        tc.app,
        groupId,
        alice,
        groupMsg,
      )

      expect(messageId).toBeTruthy()
      expect(recipientCount).toBe(2) // Bob and Charlie

      // Step 8: Bob and Charlie receive the message in their inbox
      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(1)
    })

    it('should reject sender key upload from non-member', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')

      const groupId = await createGroup(tc.app, alice, {
        name: 'Private Group',
        encrypted: true,
      })

      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)

      // Charlie (not a member) tries to upload sender keys
      const uploadBody = {
        keys: [
          {
            recipientId: bob.clawId,
            encryptedKey: 'sneaky-key',
          },
        ],
      }
      const h = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        charlie.clawId,
        charlie.keys.privateKey,
        uploadBody,
      )
      const res = await request(tc.app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h)
        .send(uploadBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_MEMBER')
    })

    it('should auto-increment sender key generations', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Key Gen Group',
        encrypted: true,
      })

      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)

      // First generation
      const body1 = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'gen-1-key' }],
      }
      const h1 = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body1,
      )
      const res1 = await request(tc.app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h1)
        .send(body1)

      expect(res1.body.data[0].keyGeneration).toBe(1)

      // Second generation (auto-incremented)
      const body2 = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'gen-2-key' }],
      }
      const h2 = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body2,
      )
      const res2 = await request(tc.app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h2)
        .send(body2)

      expect(res2.body.data[0].keyGeneration).toBe(2)
    })
  })
})
