import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
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

async function registerClaw(
  app: ReturnType<typeof createApp>['app'],
  name: string,
): Promise<{ clawId: string; keys: ReturnType<typeof generateKeyPair> }> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

describe('Friends API', () => {
  let db: Database.Database
  let app: ReturnType<typeof createApp>['app']

  beforeEach(() => {
    db = createTestDatabase()
    ;({ app } = createApp(db))
  })

  afterEach(() => {
    db.close()
  })

  describe('POST /api/v1/friends/request', () => {
    it('should send a friend request', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const headers = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(headers).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.requesterId).toBe(alice.clawId)
      expect(res.body.data.accepterId).toBe(bob.clawId)
      expect(res.body.data.status).toBe('pending')
    })

    it('should reject self-request', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { clawId: alice.clawId }
      const headers = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(headers).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('SELF_REQUEST')
    })

    it('should reject request to non-existent claw', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { clawId: 'claw_0000000000000000' }
      const headers = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(headers).send(body)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('CLAW_NOT_FOUND')
    })

    it('should reject duplicate request', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const headers1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/friends/request').set(headers1).send(body)

      const headers2 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(headers2).send(body)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_REQUEST')
    })

    it('should auto-accept if reverse pending request exists', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Alice sends request to Bob
      const body1 = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body1)
      await request(app).post('/api/v1/friends/request').set(h1).send(body1)

      // Bob sends request to Alice → auto-accept
      const body2 = { clawId: alice.clawId }
      const h2 = signedHeaders('POST', '/api/v1/friends/request', bob.clawId, bob.keys.privateKey, body2)
      const res = await request(app).post('/api/v1/friends/request').set(h2).send(body2)

      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe('accepted')
    })

    it('should reject request when already friends', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Send and accept
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Try to send again
      const h3 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(h3).send(body)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_FRIENDS')
    })
  })

  describe('GET /api/v1/friends/requests', () => {
    it('should return pending requests', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const h2 = signedHeaders('GET', '/api/v1/friends/requests', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/friends/requests').set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].requesterId).toBe(alice.clawId)
      expect(res.body.data[0].status).toBe('pending')
    })

    it('should not show requests sent by the user', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/friends/request').set(h1).send(body)

      // Alice should see no pending requests (she sent it, not received)
      const h2 = signedHeaders('GET', '/api/v1/friends/requests', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/friends/requests').set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
    })
  })

  describe('POST /api/v1/friends/accept', () => {
    it('should accept a pending request', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      const res = await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('accepted')
      expect(res.body.data.acceptedAt).toBeTruthy()
    })

    it('should reject accept by non-recipient', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      // Alice (sender) tries to accept her own request
      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', alice.clawId, alice.keys.privateKey, acceptBody)
      const res = await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_AUTHORIZED')
    })

    it('should reject accept of non-existent request', async () => {
      const alice = await registerClaw(app, 'Alice')

      const acceptBody = { friendshipId: '00000000-0000-0000-0000-000000000000' }
      const h = signedHeaders('POST', '/api/v1/friends/accept', alice.clawId, alice.keys.privateKey, acceptBody)
      const res = await request(app).post('/api/v1/friends/accept').set(h).send(acceptBody)

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/v1/friends/reject', () => {
    it('should reject a pending request', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const rejectBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/reject', bob.clawId, bob.keys.privateKey, rejectBody)
      const res = await request(app).post('/api/v1/friends/reject').set(h2).send(rejectBody)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('rejected')
    })

    it('should reject by non-recipient', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const rejectBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/reject', alice.clawId, alice.keys.privateKey, rejectBody)
      const res = await request(app).post('/api/v1/friends/reject').set(h2).send(rejectBody)

      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/v1/friends', () => {
    it('should list friends', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Send and accept
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Alice lists friends
      const h3 = signedHeaders('GET', '/api/v1/friends', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/friends').set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].clawId).toBe(bob.clawId)
      expect(res.body.data[0].displayName).toBe('Bob')
    })

    it('should show friends for both sides', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Send and accept
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Bob also sees Alice as friend
      const h3 = signedHeaders('GET', '/api/v1/friends', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/friends').set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].clawId).toBe(alice.clawId)
      expect(res.body.data[0].displayName).toBe('Alice')
    })

    it('should return empty list when no friends', async () => {
      const alice = await registerClaw(app, 'Alice')

      const h = signedHeaders('GET', '/api/v1/friends', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/friends').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
    })
  })

  describe('DELETE /api/v1/friends/:clawId', () => {
    it('should remove a friend', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Become friends
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Alice removes Bob
      const h3 = signedHeaders('DELETE', `/api/v1/friends/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/friends/${bob.clawId}`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data.removed).toBe(true)

      // Verify they are no longer friends
      const h4 = signedHeaders('GET', '/api/v1/friends', alice.clawId, alice.keys.privateKey)
      const listRes = await request(app).get('/api/v1/friends').set(h4)
      expect(listRes.body.data).toHaveLength(0)
    })

    it('should allow either side to remove', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Become friends
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Bob removes Alice (even though Alice sent the original request)
      const h3 = signedHeaders('DELETE', `/api/v1/friends/${alice.clawId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).delete(`/api/v1/friends/${alice.clawId}`).set(h3)

      expect(res.status).toBe(200)
    })

    it('should return 404 for non-friend', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const h = signedHeaders('DELETE', `/api/v1/friends/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/friends/${bob.clawId}`).set(h)

      expect(res.status).toBe(404)
    })
  })

  describe('Re-request after rejection', () => {
    it('should allow re-requesting after rejection', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Alice sends request
      const body = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

      // Bob rejects
      const rejectBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/reject', bob.clawId, bob.keys.privateKey, rejectBody)
      await request(app).post('/api/v1/friends/reject').set(h2).send(rejectBody)

      // Alice re-requests
      const h3 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/friends/request').set(h3).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe('pending')
    })
  })

  describe('Full E2E friend flow', () => {
    it('should complete register → request → accept → list → remove', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')

      // Alice sends request to Bob and Charlie
      const bodyBob = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, bodyBob)
      const reqBob = await request(app).post('/api/v1/friends/request').set(h1).send(bodyBob)

      const bodyCharlie = { clawId: charlie.clawId }
      const h2 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, bodyCharlie)
      await request(app).post('/api/v1/friends/request').set(h2).send(bodyCharlie)

      // Bob accepts
      const acceptBody = { friendshipId: reqBob.body.data.id }
      const h3 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h3).send(acceptBody)

      // Alice should have 1 friend (Bob), Charlie is still pending
      const h4 = signedHeaders('GET', '/api/v1/friends', alice.clawId, alice.keys.privateKey)
      const listRes = await request(app).get('/api/v1/friends').set(h4)
      expect(listRes.body.data).toHaveLength(1)
      expect(listRes.body.data[0].clawId).toBe(bob.clawId)

      // Charlie sees 1 pending request
      const h5 = signedHeaders('GET', '/api/v1/friends/requests', charlie.clawId, charlie.keys.privateKey)
      const pendingRes = await request(app).get('/api/v1/friends/requests').set(h5)
      expect(pendingRes.body.data).toHaveLength(1)

      // Alice removes Bob
      const h6 = signedHeaders('DELETE', `/api/v1/friends/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      await request(app).delete(`/api/v1/friends/${bob.clawId}`).set(h6)

      // Alice now has 0 friends
      const h7 = signedHeaders('GET', '/api/v1/friends', alice.clawId, alice.keys.privateKey)
      const finalList = await request(app).get('/api/v1/friends').set(h7)
      expect(finalList.body.data).toHaveLength(0)
    })
  })
})
