/**
 * E2E Test: End-to-End Encrypted Message Flow (Parameterized)
 *
 * CRITICAL PRIORITY
 *
 * Tests the complete E2EE lifecycle across BOTH SQLite and Supabase:
 * 1. Key registration and rotation
 * 2. Encrypted message exchange
 * 3. Batch key queries
 * 4. Group sender keys
 *
 * This test validates E2eeService + GroupService async abstraction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import {
  x25519SharedSecret,
  deriveSessionKey,
  aesDecrypt,
} from '@clawbuds/shared'
import type { TestContext, TestClaw, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
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
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)(
  'E2E: Encrypted Message Flow [%s]',
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

    describe('Complete E2EE Lifecycle', () => {
      it('should complete full encrypted message exchange', async () => {
        await registerE2eeKey(tc.app, alice)
        await registerE2eeKey(tc.app, bob)
        await makeFriends(tc.app, alice, bob)

        // Alice fetches Bob's public key
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

        // Alice encrypts a message for Bob
        const secretMessage = 'This is a top-secret message!'
        const encrypted = await encryptMessage(
          alice.x25519Private,
          bob.x25519Public,
          secretMessage,
        )

        // Alice sends the encrypted message
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

        // Server stores only ciphertext
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

        const storedText = serverViewRes.body.data.blocks[0].text
        expect(storedText).toContain('ciphertext')
        expect(storedText).not.toContain(secretMessage)

        // Bob retrieves and decrypts
        const inbox = await getInbox(tc.app, bob)
        expect(inbox).toHaveLength(1)
        const inboxEntry = inbox[0] as {
          message: { blocks: Array<{ text: string }> }
        }
        const receivedEnvelope = JSON.parse(
          inboxEntry.message.blocks[0].text,
        ) as { e2ee: boolean; ciphertext: string; nonce: string }

        expect(receivedEnvelope.e2ee).toBe(true)

        const decryptedMessage = await decryptMessage(
          bob.x25519Private,
          alice.x25519Public,
          receivedEnvelope.ciphertext,
          receivedEnvelope.nonce,
        )

        expect(decryptedMessage).toBe(secretMessage)
      })

      it('should prevent unauthorized decryption by third party', async () => {
        const charlie = await registerClaw(tc.app, 'Charlie')

        await registerE2eeKey(tc.app, alice)
        await registerE2eeKey(tc.app, bob)
        await registerE2eeKey(tc.app, charlie)

        const secretMsg = 'Only Bob should read this'
        const encrypted = await encryptMessage(
          alice.x25519Private,
          bob.x25519Public,
          secretMsg,
        )

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
        await registerE2eeKey(tc.app, alice)

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

        // Rotate key
        const newKey = 'aa' + alice.x25519Public.slice(2)
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
        expect(rotateRes.body.data.rotatedAt).not.toBeNull()

        // Verify updated key
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

        await registerE2eeKey(tc.app, alice)
        await registerE2eeKey(tc.app, bob)

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

        await registerE2eeKey(tc.app, alice)
        await registerE2eeKey(tc.app, bob)
        await registerE2eeKey(tc.app, charlie)

        const groupId = await createGroup(tc.app, alice, {
          name: 'Secret Group',
          encrypted: true,
        })

        await inviteToGroup(tc.app, groupId, alice, bob)
        await joinGroup(tc.app, groupId, bob)
        await inviteToGroup(tc.app, groupId, alice, charlie)
        await joinGroup(tc.app, groupId, charlie)

        // Alice uploads sender keys for Bob and Charlie
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

        // Bob retrieves his sender keys
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

        // Bob decrypts Alice's sender key
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

        // Alice sends an encrypted group message
        const { messageId, recipientCount } = await sendGroupMessage(
          tc.app,
          groupId,
          alice,
          'Secret group message',
        )

        expect(messageId).toBeTruthy()
        expect(recipientCount).toBe(2)

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
    })

    describe('Repository Type Verification', () => {
      it(`should be using ${repositoryType} repository`, () => {
        expect(tc.repositoryType).toBe(repositoryType)
      })
    })
  },
)
