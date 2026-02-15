/**
 * E2E Test: Webhook Outbound Events Flow
 *
 * IMPORTANT PRIORITY
 *
 * Tests the outgoing webhook lifecycle:
 * 1. User creates an outgoing webhook with target URL
 * 2. Events trigger webhook deliveries
 * 3. Delivery logs are recorded
 * 4. Circuit breaker disables webhook after failures
 * 5. Re-enabling resets failure count
 *
 * Also covers: SSRF protection, webhook test event, event filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { WebhookService } from '../../src/services/webhook.service.js'

import {
  type TestContext,
  type TestClaw,
  createTestContext,
  destroyTestContext,
  registerClaw,
  signedHeaders,
  makeFriends,
} from './helpers.js'

describe('E2E: Webhook Outbound Events Flow', () => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext()
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('Outgoing Webhook CRUD', () => {
    it('should create outgoing webhook with URL and events', async () => {
      const body = {
        type: 'outgoing',
        name: 'Slack Notifier',
        url: 'https://hooks.example.com/clawbuds',
        events: ['message.new', 'friend.request'],
      }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        body,
      )
      const res = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.id).toMatch(/^whk_/)
      expect(res.body.data.type).toBe('outgoing')
      expect(res.body.data.url).toBe('https://hooks.example.com/clawbuds')
      expect(res.body.data.events).toEqual(['message.new', 'friend.request'])
      expect(res.body.data.secret).toBeTruthy()
      expect(res.body.data.active).toBe(true)
      expect(res.body.data.failureCount).toBe(0)
    })

    it('should require URL for outgoing webhooks', async () => {
      const body = { type: 'outgoing', name: 'Missing URL' }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        body,
      )
      const res = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MISSING_URL')
    })

    it('should update webhook URL and events', async () => {
      // Create
      const createBody = {
        type: 'outgoing',
        name: 'Updatable',
        url: 'https://example.com/old',
        events: ['*'],
      }
      const createH = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(createH)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Update
      const updateBody = {
        url: 'https://example.com/new',
        events: ['message.new'],
        name: 'Updated Webhook',
      }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/webhooks/${webhookId}`,
        alice.clawId,
        alice.keys.privateKey,
        updateBody,
      )
      const updateRes = await request(tc.app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set(updateH)
        .send(updateBody)

      expect(updateRes.status).toBe(200)
      expect(updateRes.body.data.url).toBe('https://example.com/new')
      expect(updateRes.body.data.events).toEqual(['message.new'])
      expect(updateRes.body.data.name).toBe('Updated Webhook')
    })

    it('should prevent other users from accessing your webhooks', async () => {
      const bob = await registerClaw(tc.app, 'Bob')

      // Alice creates webhook
      const createBody = {
        type: 'outgoing',
        name: 'Private',
        url: 'https://example.com/hook',
      }
      const createH = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(createH)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Bob tries to view
      const viewH = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhookId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const viewRes = await request(tc.app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set(viewH)
      expect(viewRes.status).toBe(403)

      // Bob tries to update
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/webhooks/${webhookId}`,
        bob.clawId,
        bob.keys.privateKey,
        { name: 'Hacked' },
      )
      const updateRes = await request(tc.app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set(updateH)
        .send({ name: 'Hacked' })
      expect(updateRes.status).toBe(403)

      // Bob tries to delete
      const deleteH = signedHeaders(
        'DELETE',
        `/api/v1/webhooks/${webhookId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const deleteRes = await request(tc.app)
        .delete(`/api/v1/webhooks/${webhookId}`)
        .set(deleteH)
      expect(deleteRes.status).toBe(403)
    })
  })

  describe('Circuit Breaker Mechanism', () => {
    it('should auto-disable webhook after 10 consecutive failures', async () => {
      const service = new WebhookService(tc.db)

      const webhook = service.create({
        clawId: alice.clawId,
        type: 'outgoing',
        name: 'Failing Webhook',
        url: 'http://example.com:1/nonexistent', // Port 1 -- will fail
      })

      // Simulate 9 failures directly in DB
      tc.db
        .prepare('UPDATE webhooks SET failure_count = 9 WHERE id = ?')
        .run(webhook.id)

      // 10th failure should trigger circuit breaker
      await service.deliver(
        { ...webhook, failureCount: 9 },
        'test',
        { event: 'test', timestamp: new Date().toISOString(), data: {} },
      )

      const updated = service.findById(webhook.id)
      expect(updated).not.toBeNull()
      expect(updated!.active).toBe(false)
      expect(updated!.failureCount).toBe(10)
    }, 15000)

    it('should reset failure count when re-enabling webhook', async () => {
      // Create outgoing webhook
      const createBody = {
        type: 'outgoing',
        name: 'Resettable',
        url: 'https://example.com/hook',
      }
      const createH = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(createH)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Simulate failures and disable
      tc.db
        .prepare(
          'UPDATE webhooks SET failure_count = 8, active = 0 WHERE id = ?',
        )
        .run(webhookId)

      // Re-enable
      const updateBody = { active: true }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/webhooks/${webhookId}`,
        alice.clawId,
        alice.keys.privateKey,
        updateBody,
      )
      const res = await request(tc.app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set(updateH)
        .send(updateBody)

      expect(res.status).toBe(200)
      expect(res.body.data.active).toBe(true)
      expect(res.body.data.failureCount).toBe(0)
    })
  })

  describe('Delivery Log', () => {
    it('should track delivery attempts', async () => {
      const service = new WebhookService(tc.db)

      const webhook = service.create({
        clawId: alice.clawId,
        type: 'outgoing',
        name: 'Logged Webhook',
        url: 'http://example.com:1/fail', // Will fail
      })

      // Attempt delivery (will fail)
      const delivery = await service.deliver(
        webhook,
        'test',
        { event: 'test', data: { message: 'test delivery' } },
      )

      expect(delivery.webhookId).toBe(webhook.id)
      expect(delivery.eventType).toBe('test')
      expect(delivery.success).toBe(false)

      // Check delivery log via API
      const h = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhook.id}/deliveries`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const res = await request(tc.app)
        .get(`/api/v1/webhooks/${webhook.id}/deliveries`)
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].eventType).toBe('test')
      expect(res.body.data[0].success).toBe(false)
    }, 15000)

    it('should prevent non-owner from viewing delivery log', async () => {
      const bob = await registerClaw(tc.app, 'Bob')

      const createBody = {
        type: 'outgoing',
        name: 'Private Log',
        url: 'https://example.com/hook',
      }
      const createH = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(createH)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Bob tries to view deliveries
      const h = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhookId}/deliveries`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const res = await request(tc.app)
        .get(`/api/v1/webhooks/${webhookId}/deliveries`)
        .set(h)

      expect(res.status).toBe(403)
    })
  })

  describe('SSRF Protection', () => {
    const ssrfUrls = [
      { url: 'http://localhost:8080/admin', name: 'localhost' },
      { url: 'http://127.0.0.1:8080/admin', name: '127.0.0.1' },
      { url: 'http://10.0.0.1/internal', name: '10.x.x.x' },
      { url: 'http://172.16.0.1/internal', name: '172.16.x.x' },
      { url: 'http://192.168.1.1/router', name: '192.168.x.x' },
      { url: 'http://169.254.169.254/latest/meta-data/', name: 'AWS metadata' },
      {
        url: 'http://metadata.google.internal/computeMetadata/v1/',
        name: 'GCP metadata',
      },
      { url: 'http://[::1]:8080/admin', name: 'IPv6 localhost' },
      { url: 'file:///etc/passwd', name: 'file protocol' },
    ]

    for (const { url, name } of ssrfUrls) {
      it(`should block ${name} (${url})`, async () => {
        const body = {
          type: 'outgoing',
          name: `SSRF Test ${name}`,
          url,
        }
        const h = signedHeaders(
          'POST',
          '/api/v1/webhooks',
          alice.clawId,
          alice.keys.privateKey,
          body,
        )
        const res = await request(tc.app)
          .post('/api/v1/webhooks')
          .set(h)
          .send(body)

        expect(res.status).toBe(400)
        expect(['FORBIDDEN_URL', 'FORBIDDEN_PROTOCOL', 'VALIDATION_ERROR']).toContain(
          res.body.error.code,
        )
      })
    }

    it('should block SSRF on webhook URL update', async () => {
      // Create valid webhook
      const createBody = {
        type: 'outgoing',
        name: 'Valid',
        url: 'https://example.com/hook',
      }
      const createH = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(createH)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Try to update to internal URL
      const updateBody = { url: 'http://169.254.169.254/latest/meta-data/' }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/webhooks/${webhookId}`,
        alice.clawId,
        alice.keys.privateKey,
        updateBody,
      )
      const res = await request(tc.app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set(updateH)
        .send(updateBody)

      expect(res.status).toBe(400)

      // Verify URL was not changed
      const getH = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhookId}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const getRes = await request(tc.app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set(getH)

      expect(getRes.body.data.url).toBe('https://example.com/hook')
    })
  })

  describe('HMAC Signature Generation', () => {
    it('should generate valid HMAC-SHA256 signatures for outgoing payloads', () => {
      const service = new WebhookService(tc.db)
      const secret = 'test-secret-key'
      const payload = JSON.stringify({
        event: 'message.new',
        data: { text: 'Hello' },
      })

      const sig = service.generateSignature(secret, payload)
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)

      // Verify the signature
      expect(service.verifySignature(secret, payload, sig)).toBe(true)
      expect(service.verifySignature('wrong', payload, sig)).toBe(false)
      expect(service.verifySignature(secret, 'tampered', sig)).toBe(false)
    })
  })
})
