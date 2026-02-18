import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import { createTestContext, destroyTestContext, getAvailableRepositoryTypes, generateWebhookSignature, type TestContext } from './e2e/helpers.js'
import { WebhookService } from '../src/services/webhook.service.js'
import { SqliteWebhookRepository } from '../src/db/repositories/sqlite/webhook.repository.js'

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
  app: TestContext['app'],
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

describe.each(getAvailableRepositoryTypes())('Webhooks API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('CRUD', () => {
    it('should create an outgoing webhook', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = {
        type: 'outgoing',
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['message.new', 'friend.request'],
      }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.id).toBeTruthy()
      expect(res.body.data.name).toBe('My Webhook')
      expect(res.body.data.type).toBe('outgoing')
      expect(res.body.data.url).toBe('https://example.com/webhook')
      expect(res.body.data.events).toEqual(['message.new', 'friend.request'])
      expect(res.body.data.secret).toBeTruthy()
      expect(res.body.data.active).toBe(true)
    })

    it('should create an incoming webhook', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'incoming', name: 'Incoming Hook' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.type).toBe('incoming')
      expect(res.body.data.url).toBeNull()
    })

    it('should reject outgoing webhook without URL', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'No URL' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MISSING_URL')
    })

    it('should list webhooks for a claw (secrets redacted)', async () => {
      const alice = await registerClaw(app, 'Alice')

      // Create two webhooks
      const body1 = { type: 'outgoing', name: 'Hook 1', url: 'https://example.com/1' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body1)
      await request(app).post('/api/v1/webhooks').set(h1).send(body1)

      const body2 = { type: 'incoming', name: 'Hook 2' }
      const h2 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body2)
      await request(app).post('/api/v1/webhooks').set(h2).send(body2)

      const h3 = signedHeaders('GET', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/webhooks').set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      // Secret must NOT be exposed in list responses
      for (const webhook of res.body.data) {
        expect(webhook.secret).toBeUndefined()
      }
    })

    it('should get webhook by id (secret redacted)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const h2 = signedHeaders('GET', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).get(`/api/v1/webhooks/${webhookId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(webhookId)
      // Secret must NOT be exposed in detail responses
      expect(res.body.data.secret).toBeUndefined()
    })

    it('should not let others see your webhook', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const h2 = signedHeaders('GET', `/api/v1/webhooks/${webhookId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).get(`/api/v1/webhooks/${webhookId}`).set(h2)

      expect(res.status).toBe(403)
    })

    it('should update webhook (secret redacted)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const updateBody = { url: 'https://example.com/new-hook', events: ['message.new'] }
      const h2 = signedHeaders('PATCH', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey, updateBody)
      const res = await request(app).patch(`/api/v1/webhooks/${webhookId}`).set(h2).send(updateBody)

      expect(res.status).toBe(200)
      expect(res.body.data.url).toBe('https://example.com/new-hook')
      expect(res.body.data.events).toEqual(['message.new'])
      // Secret must NOT be exposed in update responses
      expect(res.body.data.secret).toBeUndefined()
    })

    it('should delete webhook', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const h2 = signedHeaders('DELETE', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/webhooks/${webhookId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      // Verify it's gone
      const h3 = signedHeaders('GET', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey)
      const getRes = await request(app).get(`/api/v1/webhooks/${webhookId}`).set(h3)
      expect(getRes.status).toBe(404)
    })

    it('should not delete webhook owned by another claw', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const h2 = signedHeaders('DELETE', `/api/v1/webhooks/${webhookId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).delete(`/api/v1/webhooks/${webhookId}`).set(h2)

      expect(res.status).toBe(403)
    })

    it('should enforce unique name per claw', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Same Name', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/webhooks').set(h1).send(body)

      const body2 = { type: 'outgoing', name: 'Same Name', url: 'https://example.com/hook2' }
      const h2 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body2)
      const res = await request(app).post('/api/v1/webhooks').set(h2).send(body2)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_NAME')
    })
  })

  describe('HMAC Signature', () => {
    it.skipIf(repositoryType !== 'sqlite')('should generate and verify HMAC signature', () => {
      const service = new WebhookService(new SqliteWebhookRepository(tc.db!))
      const secret = 'test-secret'
      const payload = JSON.stringify({ event: 'test', data: {} })

      const signature = service.generateSignature(secret, payload)
      expect(signature).toMatch(/^sha256=[0-9a-f]+$/)
      expect(service.verifySignature(secret, payload, signature)).toBe(true)
      expect(service.verifySignature('wrong-secret', payload, signature)).toBe(false)
      expect(service.verifySignature(secret, 'wrong-payload', signature)).toBe(false)
    })
  })

  describe('Incoming Webhook', () => {
    it('should accept valid incoming webhook and create message', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Create friendship so Alice can send public messages
      const friendBody = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, friendBody)
      const friendReq = await request(app).post('/api/v1/friends/request').set(h1).send(friendBody)
      const friendshipId = friendReq.body.data.id

      const acceptBody = { friendshipId }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Create incoming webhook
      const createBody = { type: 'incoming', name: 'External' }
      const h3 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h3).send(createBody)
      const webhook = createRes.body.data

      // Send incoming webhook with HMAC signature (no toClawIds = public message to all friends)
      const incomingBody = { text: 'Hello from external service' }
      const bodyStr = JSON.stringify(incomingBody)
      const signature = generateWebhookSignature(webhook.secret, bodyStr)

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(incomingBody)

      expect(res.status).toBe(200)
      expect(res.body.data.received).toBe(true)
      expect(res.body.data.messageId).toBeTruthy()
      expect(res.body.data.recipientCount).toBe(1) // Sent to Bob (Alice's friend)

      // Verify message was created and delivered to Bob's inbox
      const h4 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const inboxRes = await request(app).get('/api/v1/inbox').set(h4)

      expect(inboxRes.status).toBe(200)
      expect(inboxRes.body.data).toHaveLength(1)
      expect(inboxRes.body.data[0].message.blocks).toEqual([
        { type: 'text', text: 'Hello from external service' },
      ])
      expect(inboxRes.body.data[0].message.fromClawId).toBe(alice.clawId)
    })

    it('should reject incoming webhook with invalid signature', async () => {
      const alice = await registerClaw(app, 'Alice')

      const createBody = { type: 'incoming', name: 'External' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(createBody)
      const webhook = createRes.body.data

      const incomingBody = { text: 'Hello' }
      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', 'sha256=invalid')
        .send(incomingBody)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })

    it('should reject incoming webhook without signature', async () => {
      const alice = await registerClaw(app, 'Alice')

      const createBody = { type: 'incoming', name: 'External' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(createBody)
      const webhook = createRes.body.data

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .send({ text: 'Hello' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('MISSING_SIGNATURE')
    })

    it('should reject incoming webhook for outgoing type', async () => {
      const alice = await registerClaw(app, 'Alice')

      const createBody = { type: 'outgoing', name: 'Out', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(createBody)
      const webhook = createRes.body.data

      const signature = generateWebhookSignature(webhook.secret, JSON.stringify({ text: 'Hello' }))

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send({ text: 'Hello' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_TYPE')
    })

    it('should send to multiple recipients via toClawIds', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')

      // Create friendships (required for direct messages)
      const friendBody1 = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, friendBody1)
      const friendReq1 = await request(app).post('/api/v1/friends/request').set(h1).send(friendBody1)
      const friendshipId1 = friendReq1.body.data.id

      const acceptBody1 = { friendshipId: friendshipId1 }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody1)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody1)

      const friendBody2 = { clawId: charlie.clawId }
      const h3 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, friendBody2)
      const friendReq2 = await request(app).post('/api/v1/friends/request').set(h3).send(friendBody2)
      const friendshipId2 = friendReq2.body.data.id

      const acceptBody2 = { friendshipId: friendshipId2 }
      const h4 = signedHeaders('POST', '/api/v1/friends/accept', charlie.clawId, charlie.keys.privateKey, acceptBody2)
      await request(app).post('/api/v1/friends/accept').set(h4).send(acceptBody2)

      // Create incoming webhook
      const createBody = { type: 'incoming', name: 'Multi' }
      const h5 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h5).send(createBody)
      const webhook = createRes.body.data

      // Send to both Bob and Charlie
      const incomingBody = { text: 'Notification for all', toClawIds: [bob.clawId, charlie.clawId] }
      const bodyStr = JSON.stringify(incomingBody)
      const signature = generateWebhookSignature(webhook.secret, bodyStr)

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(incomingBody)

      expect(res.status).toBe(200)
      expect(res.body.data.recipientCount).toBe(2)

      // Check Bob's inbox
      const hBob = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const bobInbox = await request(app).get('/api/v1/inbox').set(hBob)
      expect(bobInbox.body.data).toHaveLength(1)
      expect(bobInbox.body.data[0].message.blocks[0].text).toBe('Notification for all')

      // Check Charlie's inbox
      const hCharlie = signedHeaders('GET', '/api/v1/inbox', charlie.clawId, charlie.keys.privateKey)
      const charlieInbox = await request(app).get('/api/v1/inbox').set(hCharlie)
      expect(charlieInbox.body.data).toHaveLength(1)
      expect(charlieInbox.body.data[0].message.blocks[0].text).toBe('Notification for all')
    })

    it('should support visibility parameter', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Create friendship
      const friendBody = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, friendBody)
      const friendReq = await request(app).post('/api/v1/friends/request').set(h1).send(friendBody)
      const friendshipId = friendReq.body.data.id

      const acceptBody = { friendshipId }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      // Create incoming webhook
      const createBody = { type: 'incoming', name: 'Visibility Test' }
      const h3 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/webhooks').set(h3).send(createBody)
      const webhook = createRes.body.data

      // Send with visibility: public
      const incomingBody = { text: 'Public announcement', visibility: 'public' as const }
      const bodyStr = JSON.stringify(incomingBody)
      const signature = generateWebhookSignature(webhook.secret, bodyStr)

      const res = await request(app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(incomingBody)

      expect(res.status).toBe(200)
      // Should be sent to all friends (Bob in this case)
      expect(res.body.data.recipientCount).toBe(1)
    })
  })

  describe('Deliveries', () => {
    it('should list deliveries for a webhook', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      const h2 = signedHeaders('GET', `/api/v1/webhooks/${webhookId}/deliveries`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).get(`/api/v1/webhooks/${webhookId}/deliveries`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })
  })

  describe('Disable/Enable', () => {
    it.skipIf(repositoryType !== 'sqlite')('should reset failure count when re-enabling', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      // Simulate failures by directly updating DB
      tc.db!.prepare('UPDATE webhooks SET failure_count = 5, active = 0 WHERE id = ?').run(webhookId)

      // Re-enable
      const updateBody = { active: true }
      const h2 = signedHeaders('PATCH', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey, updateBody)
      const res = await request(app).patch(`/api/v1/webhooks/${webhookId}`).set(h2).send(updateBody)

      expect(res.status).toBe(200)
      expect(res.body.data.active).toBe(true)
      expect(res.body.data.failureCount).toBe(0)
    })
  })

  describe('Circuit Breaker', () => {
    it.skipIf(repositoryType !== 'sqlite')('should auto-disable webhook after 10 consecutive failures', async () => {
      const service = new WebhookService(new SqliteWebhookRepository(tc.db!))

      const alice = await registerClaw(app, 'Alice')

      // Create webhook via service with an invalid port (will fail quickly)
      const webhook = await service.create({
        clawId: alice.clawId,
        type: 'outgoing',
        name: 'Breaker Test',
        url: 'http://example.com:1/nonexistent', // Port 1 will be rejected, fails fast
      })

      // Simulate 9 failures
      tc.db!.prepare('UPDATE webhooks SET failure_count = 9 WHERE id = ?').run(webhook.id)

      // Deliver should fail and trigger circuit breaker
      await service.deliver(
        { ...webhook, failureCount: 9 },
        'test',
        { event: 'test', timestamp: new Date().toISOString(), data: {} },
      )

      // Check webhook is disabled
      const updated = await service.findById(webhook.id)
      expect(updated!.active).toBe(false)
      expect(updated!.failureCount).toBe(10)
    }, 15000) // Increase timeout to 15s just in case
  })

  describe('SSRF Protection', () => {
    it('should reject localhost URLs', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://localhost:8080/admin' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject 127.0.0.1 URLs', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://127.0.0.1:8080/admin' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject 10.x.x.x private IP range', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://10.0.0.1/internal' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject 172.16-31.x.x private IP range', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://172.16.0.1/internal' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject 192.168.x.x private IP range', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://192.168.1.1/router' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject link-local addresses (169.254.x.x)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://169.254.1.1/metadata' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject AWS/GCP metadata service (169.254.169.254)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://169.254.169.254/latest/meta-data/' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject GCP metadata service (metadata.google.internal)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://metadata.google.internal/computeMetadata/v1/' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject IPv6 localhost (::1)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'http://[::1]:8080/admin' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')
    })

    it('should reject non-HTTP/HTTPS protocols', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'file:///etc/passwd' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_PROTOCOL')
    })

    it('should reject invalid URL format via Zod validation', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { type: 'outgoing', name: 'Bad', url: 'not-a-valid-url' }
      const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should accept valid public URLs', async () => {
      const alice = await registerClaw(app, 'Alice')

      const validUrls = [
        'https://example.com/webhook',
        'https://api.example.com:8443/hooks/clawbuds',
        'http://public.example.org/notify',
        'https://1.1.1.1/webhook', // Cloudflare DNS, public IP
      ]

      for (const url of validUrls) {
        const body = { type: 'outgoing', name: `Valid ${url}`, url }
        const h = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
        const res = await request(app).post('/api/v1/webhooks').set(h).send(body)

        expect(res.status).toBe(201)
        expect(res.body.data.url).toBe(url)
      }
    })

    it('should reject internal URLs when updating webhook', async () => {
      const alice = await registerClaw(app, 'Alice')

      // Create valid webhook
      const body = { type: 'outgoing', name: 'Test', url: 'https://example.com/hook' }
      const h1 = signedHeaders('POST', '/api/v1/webhooks', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/webhooks').set(h1).send(body)
      const webhookId = createRes.body.data.id

      // Try to update to internal URL
      const updateBody = { url: 'http://localhost:8080/admin' }
      const h2 = signedHeaders('PATCH', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey, updateBody)
      const res = await request(app).patch(`/api/v1/webhooks/${webhookId}`).set(h2).send(updateBody)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FORBIDDEN_URL')

      // Verify webhook URL didn't change
      const h3 = signedHeaders('GET', `/api/v1/webhooks/${webhookId}`, alice.clawId, alice.keys.privateKey)
      const getRes = await request(app).get(`/api/v1/webhooks/${webhookId}`).set(h3)
      expect(getRes.body.data.url).toBe('https://example.com/hook')
    })
  })
})
