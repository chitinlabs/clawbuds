/**
 * E2E Test: Webhook Inbound Message Flow
 *
 * CRITICAL PRIORITY
 *
 * Tests the complete incoming webhook lifecycle:
 * 1. User creates an incoming webhook (gets secret)
 * 2. External service sends message via webhook with HMAC signature
 * 3. Message appears in recipients' inboxes
 * 4. HMAC signature verification blocks invalid requests
 *
 * Also covers: disabled webhooks, type validation, recipient routing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'

import {
  type TestContext,
  type TestClaw,
  createTestContext,
  destroyTestContext,
  registerClaw,
  signedHeaders,
  makeFriends,
  getInbox,
  generateWebhookSignature,
} from './helpers.js'

describe('E2E: Webhook Inbound Message Flow', () => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw

  beforeEach(async () => {
    tc = createTestContext()
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    // Alice and Bob become friends (required for message delivery)
    await makeFriends(tc.app, alice, bob)
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('Complete Inbound Webhook Flow', () => {
    it('should deliver external message to all friends via public visibility', async () => {
      // Step 1: Alice creates an incoming webhook
      const createBody = { type: 'incoming', name: 'CI/CD Notifier' }
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

      expect(createRes.status).toBe(201)
      const webhook = createRes.body.data
      expect(webhook.id).toMatch(/^whk_/)
      expect(webhook.type).toBe('incoming')
      expect(webhook.secret).toBeTruthy()
      expect(webhook.active).toBe(true)

      // Step 2: External service sends message with HMAC signature
      const incomingPayload = { text: 'Build #42 passed. All green!' }
      const payloadStr = JSON.stringify(incomingPayload)
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        payloadStr,
      )

      const incomingRes = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(incomingPayload)

      expect(incomingRes.status).toBe(200)
      expect(incomingRes.body.data.received).toBe(true)
      expect(incomingRes.body.data.clawId).toBe(alice.clawId)
      expect(incomingRes.body.data.messageId).toBeTruthy()
      expect(incomingRes.body.data.recipientCount).toBe(1)

      // Step 3: Verify message appears in Bob's inbox
      const bobInbox = await getInbox(tc.app, bob)
      expect(bobInbox).toHaveLength(1)

      const inboxEntry = bobInbox[0] as {
        message: {
          fromClawId: string
          blocks: Array<{ type: string; text: string }>
        }
      }
      expect(inboxEntry.message.fromClawId).toBe(alice.clawId)
      expect(inboxEntry.message.blocks[0].type).toBe('text')
      expect(inboxEntry.message.blocks[0].text).toBe(
        'Build #42 passed. All green!',
      )
    })

    it('should deliver to specific recipients via toClawIds', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')
      await makeFriends(tc.app, alice, charlie)

      // Create incoming webhook
      const createBody = { type: 'incoming', name: 'Targeted Notifier' }
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
      const webhook = createRes.body.data

      // Send to Bob and Charlie specifically
      const incomingPayload = {
        text: 'Deploy notification for team',
        toClawIds: [bob.clawId, charlie.clawId],
      }
      const payloadStr = JSON.stringify(incomingPayload)
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        payloadStr,
      )

      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(incomingPayload)

      expect(res.status).toBe(200)
      expect(res.body.data.recipientCount).toBe(2)

      // Both Bob and Charlie should receive it
      const bobInbox = await getInbox(tc.app, bob)
      const charlieInbox = await getInbox(tc.app, charlie)

      expect(bobInbox).toHaveLength(1)
      expect(charlieInbox).toHaveLength(1)

      const bobMsg = (bobInbox[0] as { message: { blocks: Array<{ text: string }> } })
        .message.blocks[0].text
      const charlieMsg = (charlieInbox[0] as { message: { blocks: Array<{ text: string }> } })
        .message.blocks[0].text

      expect(bobMsg).toBe('Deploy notification for team')
      expect(charlieMsg).toBe('Deploy notification for team')
    })
  })

  describe('HMAC Signature Verification', () => {
    it('should reject request with missing signature header', async () => {
      const createBody = { type: 'incoming', name: 'Test Hook' }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Send without signature header
      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhookId}`)
        .send({ text: 'No signature' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('MISSING_SIGNATURE')
    })

    it('should reject request with invalid signature', async () => {
      const createBody = { type: 'incoming', name: 'Test Hook' }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Send with wrong signature
      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhookId}`)
        .set('X-ClawBuds-Signature', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
        .send({ text: 'Wrong signature' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })

    it('should reject signature computed with wrong secret', async () => {
      const createBody = { type: 'incoming', name: 'Test Hook' }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(createBody)
      const webhookId = createRes.body.data.id

      // Compute signature with a wrong secret
      const payload = JSON.stringify({ text: 'Tampered' })
      const wrongSignature = `sha256=${createHmac('sha256', 'wrong-secret').update(payload).digest('hex')}`

      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhookId}`)
        .set('X-ClawBuds-Signature', wrongSignature)
        .send({ text: 'Tampered' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })

    it('should reject when payload is tampered after signing', async () => {
      const createBody = { type: 'incoming', name: 'Test Hook' }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(createBody)
      const webhook = createRes.body.data

      // Sign original payload
      const originalPayload = { text: 'Original message' }
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        JSON.stringify(originalPayload),
      )

      // Send different payload with the original signature
      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send({ text: 'Tampered message' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })
  })

  describe('Webhook State Validation', () => {
    it('should reject incoming request on outgoing webhook', async () => {
      const createBody = {
        type: 'outgoing',
        name: 'Outgoing Hook',
        url: 'https://example.com/hook',
      }
      const h = signedHeaders(
        'POST',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
        createBody,
      )
      const createRes = await request(tc.app)
        .post('/api/v1/webhooks')
        .set(h)
        .send(createBody)
      const webhook = createRes.body.data

      const payload = { text: 'Should not work' }
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        JSON.stringify(payload),
      )

      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(payload)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_TYPE')
    })

    it('should reject when webhook is disabled', async () => {
      // Create incoming webhook
      const createBody = { type: 'incoming', name: 'Disabled Hook' }
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
      const webhook = createRes.body.data

      // Disable the webhook
      const updateBody = { active: false }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/webhooks/${webhook.id}`,
        alice.clawId,
        alice.keys.privateKey,
        updateBody,
      )
      await request(tc.app)
        .patch(`/api/v1/webhooks/${webhook.id}`)
        .set(updateH)
        .send(updateBody)

      // Try to use disabled webhook
      const payload = { text: 'Should be rejected' }
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        JSON.stringify(payload),
      )

      const res = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(payload)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('WEBHOOK_DISABLED')
    })

    it('should reject for non-existent webhook id', async () => {
      const res = await request(tc.app)
        .post('/api/v1/webhooks/incoming/whk_nonexistent')
        .set('X-ClawBuds-Signature', 'sha256=fake')
        .send({ text: 'Hello' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Webhook CRUD Integration', () => {
    it('should complete full webhook lifecycle: create -> use -> list deliveries -> delete', async () => {
      // Step 1: Create incoming webhook
      const createBody = { type: 'incoming', name: 'Full Lifecycle' }
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

      expect(createRes.status).toBe(201)
      const webhook = createRes.body.data

      // Step 2: Use the webhook
      const payload = { text: 'Lifecycle test message' }
      const payloadStr = JSON.stringify(payload)
      const signature = generateWebhookSignature(
        tc.db,
        webhook.secret,
        payloadStr,
      )

      const useRes = await request(tc.app)
        .post(`/api/v1/webhooks/incoming/${webhook.id}`)
        .set('X-ClawBuds-Signature', signature)
        .send(payload)

      expect(useRes.status).toBe(200)

      // Step 3: List webhooks and verify
      const listH = signedHeaders(
        'GET',
        '/api/v1/webhooks',
        alice.clawId,
        alice.keys.privateKey,
      )
      const listRes = await request(tc.app)
        .get('/api/v1/webhooks')
        .set(listH)

      expect(listRes.status).toBe(200)
      expect(listRes.body.data).toHaveLength(1)
      expect(listRes.body.data[0].id).toBe(webhook.id)

      // Step 4: Get webhook details
      const detailH = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhook.id}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const detailRes = await request(tc.app)
        .get(`/api/v1/webhooks/${webhook.id}`)
        .set(detailH)

      expect(detailRes.status).toBe(200)
      expect(detailRes.body.data.name).toBe('Full Lifecycle')

      // Step 5: Delete webhook
      const deleteH = signedHeaders(
        'DELETE',
        `/api/v1/webhooks/${webhook.id}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const deleteRes = await request(tc.app)
        .delete(`/api/v1/webhooks/${webhook.id}`)
        .set(deleteH)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.data.deleted).toBe(true)

      // Step 6: Verify webhook is gone
      const verifyH = signedHeaders(
        'GET',
        `/api/v1/webhooks/${webhook.id}`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const verifyRes = await request(tc.app)
        .get(`/api/v1/webhooks/${webhook.id}`)
        .set(verifyH)

      expect(verifyRes.status).toBe(404)
    })
  })
})
