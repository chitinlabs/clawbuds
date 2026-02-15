import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { generateKeyPair, sign, buildSignMessage, ed25519PrivateToX25519, x25519GetPublicKey } from '@clawbuds/shared'
import { createApp } from '../src/app.js'
import { createTestDatabase } from '../src/db/database.js'

function signedHeaders(
  method: string,
  path: string,
  clawId: string,
  privateKey: string,
  body?: Record<string, unknown>,
) {
  const timestamp = String(Date.now())
  const bodyString = body ? JSON.stringify(body) : ''
  const message = buildSignMessage(method, path, timestamp, bodyString)
  const signature = sign(message, privateKey)
  return {
    'X-Claw-Id': clawId,
    'X-Claw-Timestamp': timestamp,
    'X-Claw-Signature': signature,
  }
}

interface TestClaw {
  clawId: string
  keys: ReturnType<typeof generateKeyPair>
}

async function registerClaw(
  app: ReturnType<typeof createApp>['app'],
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

describe('E2EE API', () => {
  let db: Database.Database
  let app: ReturnType<typeof createApp>['app']

  beforeEach(() => {
    db = createTestDatabase()
    ;({ app } = createApp(db))
  })

  afterEach(() => {
    db.close()
  })

  describe('Key Registration', () => {
    it('should register X25519 public key', async () => {
      const alice = await registerClaw(app, 'Alice')

      // Derive X25519 key from Ed25519 key
      const x25519Private = ed25519PrivateToX25519(alice.keys.privateKey)
      const x25519Public = x25519GetPublicKey(x25519Private)

      const body = { x25519PublicKey: x25519Public }
      const h = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/e2ee/keys').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.clawId).toBe(alice.clawId)
      expect(res.body.data.x25519PublicKey).toBe(x25519Public)
      expect(res.body.data.keyFingerprint).toBeTruthy()
      expect(res.body.data.keyFingerprint.length).toBe(16)
    })

    it('should get public key by clawId', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const x25519Private = ed25519PrivateToX25519(alice.keys.privateKey)
      const x25519Public = x25519GetPublicKey(x25519Private)

      const body = { x25519PublicKey: x25519Public }
      const h1 = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/e2ee/keys').set(h1).send(body)

      // Bob queries Alice's key
      const h2 = signedHeaders('GET', `/api/v1/e2ee/keys/${alice.clawId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).get(`/api/v1/e2ee/keys/${alice.clawId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.x25519PublicKey).toBe(x25519Public)
    })

    it('should return 404 for non-registered key', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const h = signedHeaders('GET', `/api/v1/e2ee/keys/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).get(`/api/v1/e2ee/keys/${bob.clawId}`).set(h)

      expect(res.status).toBe(404)
    })

    it('should update key on re-registration (rotation)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const x25519Private1 = ed25519PrivateToX25519(alice.keys.privateKey)
      const x25519Public1 = x25519GetPublicKey(x25519Private1)

      const body1 = { x25519PublicKey: x25519Public1 }
      const h1 = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body1)
      await request(app).post('/api/v1/e2ee/keys').set(h1).send(body1)

      // Register a new key
      const newKey = 'aaaa' + x25519Public1.slice(4) // Different key
      const body2 = { x25519PublicKey: newKey }
      const h2 = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body2)
      const res = await request(app).post('/api/v1/e2ee/keys').set(h2).send(body2)

      expect(res.status).toBe(201)
      expect(res.body.data.x25519PublicKey).toBe(newKey)
      expect(res.body.data.rotatedAt).toBeTruthy()
    })

    it('should delete own key', async () => {
      const alice = await registerClaw(app, 'Alice')

      const x25519Private = ed25519PrivateToX25519(alice.keys.privateKey)
      const x25519Public = x25519GetPublicKey(x25519Private)

      const body = { x25519PublicKey: x25519Public }
      const h1 = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/e2ee/keys').set(h1).send(body)

      const h2 = signedHeaders('DELETE', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete('/api/v1/e2ee/keys').set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      // Verify key is gone
      const h3 = signedHeaders('GET', `/api/v1/e2ee/keys/${alice.clawId}`, alice.clawId, alice.keys.privateKey)
      const getRes = await request(app).get(`/api/v1/e2ee/keys/${alice.clawId}`).set(h3)
      expect(getRes.status).toBe(404)
    })

    it('should return 404 when deleting non-existent key', async () => {
      const alice = await registerClaw(app, 'Alice')

      const h = signedHeaders('DELETE', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete('/api/v1/e2ee/keys').set(h)

      expect(res.status).toBe(404)
    })
  })

  describe('Batch Key Query', () => {
    it('should batch get multiple keys', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')

      // Register keys for Alice and Bob
      for (const user of [alice, bob]) {
        const x25519Private = ed25519PrivateToX25519(user.keys.privateKey)
        const x25519Public = x25519GetPublicKey(x25519Private)
        const body = { x25519PublicKey: x25519Public }
        const h = signedHeaders('POST', '/api/v1/e2ee/keys', user.clawId, user.keys.privateKey, body)
        await request(app).post('/api/v1/e2ee/keys').set(h).send(body)
      }

      // Charlie queries both keys
      const batchBody = { clawIds: [alice.clawId, bob.clawId] }
      const h = signedHeaders('POST', '/api/v1/e2ee/keys/batch', charlie.clawId, charlie.keys.privateKey, batchBody)
      const res = await request(app).post('/api/v1/e2ee/keys/batch').set(h).send(batchBody)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })

    it('should return only registered keys in batch', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Only register Alice's key
      const x25519Private = ed25519PrivateToX25519(alice.keys.privateKey)
      const x25519Public = x25519GetPublicKey(x25519Private)
      const body = { x25519PublicKey: x25519Public }
      const h1 = signedHeaders('POST', '/api/v1/e2ee/keys', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/e2ee/keys').set(h1).send(body)

      // Query both
      const batchBody = { clawIds: [alice.clawId, bob.clawId] }
      const h2 = signedHeaders('POST', '/api/v1/e2ee/keys/batch', alice.clawId, alice.keys.privateKey, batchBody)
      const res = await request(app).post('/api/v1/e2ee/keys/batch').set(h2).send(batchBody)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].clawId).toBe(alice.clawId)
    })
  })

  describe('Sender Keys (Group E2EE)', () => {
    async function createGroupWithMembers(
      owner: TestClaw,
      members: TestClaw[],
    ): Promise<string> {
      const body = { name: 'E2EE Test Group', type: 'private', encrypted: true }
      const h = signedHeaders('POST', '/api/v1/groups', owner.clawId, owner.keys.privateKey, body)
      const res = await request(app).post('/api/v1/groups').set(h).send(body)
      const groupId = res.body.data.id

      for (const member of members) {
        // Invite
        const inviteBody = { clawId: member.clawId }
        const ih = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/invite`,
          owner.clawId,
          owner.keys.privateKey,
          inviteBody,
        )
        await request(app).post(`/api/v1/groups/${groupId}/invite`).set(ih).send(inviteBody)

        // Accept (join)
        const ah = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/join`,
          member.clawId,
          member.keys.privateKey,
        )
        await request(app).post(`/api/v1/groups/${groupId}/join`).set(ah)
      }

      return groupId
    }

    it('should upload sender keys for a group', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const groupId = await createGroupWithMembers(alice, [bob])

      const body = {
        keys: [
          { recipientId: bob.clawId, encryptedKey: 'encrypted-key-for-bob' },
        ],
      }
      const h = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body,
      )
      const res = await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].senderId).toBe(alice.clawId)
      expect(res.body.data[0].recipientId).toBe(bob.clawId)
      expect(res.body.data[0].encryptedKey).toBe('encrypted-key-for-bob')
      expect(res.body.data[0].keyGeneration).toBe(1)
    })

    it('should get sender keys for recipient', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const groupId = await createGroupWithMembers(alice, [bob])

      // Alice uploads key for Bob
      const uploadBody = {
        keys: [
          { recipientId: bob.clawId, encryptedKey: 'key-for-bob-from-alice' },
        ],
      }
      const uh = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        uploadBody,
      )
      await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(uh)
        .send(uploadBody)

      // Bob gets his sender keys
      const gh = signedHeaders(
        'GET',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res = await request(app)
        .get(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(gh)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].senderId).toBe(alice.clawId)
      expect(res.body.data[0].encryptedKey).toBe('key-for-bob-from-alice')
    })

    it('should reject sender key upload from non-member', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      const groupId = await createGroupWithMembers(alice, [bob])

      const body = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'sneaky-key' }],
      }
      const h = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        charlie.clawId,
        charlie.keys.privateKey,
        body,
      )
      const res = await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h)
        .send(body)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_MEMBER')
    })

    it('should auto-increment key generation', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const groupId = await createGroupWithMembers(alice, [bob])

      // First upload
      const body1 = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'key-gen-1' }],
      }
      const h1 = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body1,
      )
      const res1 = await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h1)
        .send(body1)
      expect(res1.body.data[0].keyGeneration).toBe(1)

      // Second upload (should auto-increment)
      const body2 = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'key-gen-2' }],
      }
      const h2 = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body2,
      )
      const res2 = await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h2)
        .send(body2)
      expect(res2.body.data[0].keyGeneration).toBe(2)
    })

    it('should support explicit key generation', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const groupId = await createGroupWithMembers(alice, [bob])

      const body = {
        keys: [{ recipientId: bob.clawId, encryptedKey: 'key-gen-5' }],
        keyGeneration: 5,
      }
      const h = signedHeaders(
        'POST',
        `/api/v1/e2ee/groups/${groupId}/sender-keys`,
        alice.clawId,
        alice.keys.privateKey,
        body,
      )
      const res = await request(app)
        .post(`/api/v1/e2ee/groups/${groupId}/sender-keys`)
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
      expect(res.body.data[0].keyGeneration).toBe(5)
    })
  })
})
