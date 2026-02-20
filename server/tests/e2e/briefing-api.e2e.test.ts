/**
 * E2E Test: Briefing API（Phase 6）
 * GET /api/v1/briefings, GET /api/v1/briefings/latest,
 * POST /api/v1/briefings/:id/ack, POST /api/v1/briefings/publish
 * 参数化运行：SQLite + Supabase
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { TestContext, TestClaw, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
  signedHeaders,
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)('E2E: Briefing API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── POST /api/v1/briefings/publish ──────────────────────────────────────
  describe('POST /api/v1/briefings/publish', () => {
    it('should create a briefing and return 201', async () => {
      const body = { content: '# Today Briefing\n\nQ1: Nothing critical.' }
      const h = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/briefings/publish')
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toMatch(/^brief_/)
      expect(res.body.data.generatedAt).toBeTruthy()
    })

    it('should return 400 when content is missing', async () => {
      const body = {}
      const h = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/briefings/publish')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('should accept rawData', async () => {
      const body = {
        content: '# Briefing with raw data',
        rawData: { messages: [{ senderId: 'friend1', count: 2 }] },
      }
      const h = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/briefings/publish')
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
    })

    it('should require authentication', async () => {
      const res = await request(tc.app)
        .post('/api/v1/briefings/publish')
        .send({ content: '# Test' })

      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/briefings/latest ────────────────────────────────────────
  describe('GET /api/v1/briefings/latest', () => {
    it('should return 404 when no briefings', async () => {
      const h = signedHeaders('GET', '/api/v1/briefings/latest', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/briefings/latest')
        .set(h)

      expect(res.status).toBe(404)
    })

    it('should return latest briefing after publish', async () => {
      // First publish
      const pubBody = { content: '# Latest Test Briefing' }
      const pubH = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, pubBody)
      await request(tc.app)
        .post('/api/v1/briefings/publish')
        .set(pubH)
        .send(pubBody)

      // Then get latest
      const h = signedHeaders('GET', '/api/v1/briefings/latest', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/briefings/latest')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.content).toBe('# Latest Test Briefing')
      expect(res.body.data.acknowledgedAt).toBeNull()
    })
  })

  // ─── GET /api/v1/briefings ───────────────────────────────────────────────
  describe('GET /api/v1/briefings', () => {
    it('should return empty list when no briefings', async () => {
      const h = signedHeaders('GET', '/api/v1/briefings', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/briefings')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('should return briefings list after publish', async () => {
      // Publish two briefings
      for (const content of ['# Briefing 1', '# Briefing 2']) {
        const body = { content }
        const h = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, body)
        await request(tc.app).post('/api/v1/briefings/publish').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/briefings', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/briefings').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBe(2)
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0)
      expect(res.body.meta.unread).toBe(2)
    })
  })

  // ─── POST /api/v1/briefings/:id/ack ──────────────────────────────────────
  describe('POST /api/v1/briefings/:id/ack', () => {
    it('should acknowledge a briefing', async () => {
      // Publish first
      const pubBody = { content: '# To Acknowledge' }
      const pubH = signedHeaders('POST', '/api/v1/briefings/publish', alice.clawId, alice.keys.privateKey, pubBody)
      const pubRes = await request(tc.app)
        .post('/api/v1/briefings/publish')
        .set(pubH)
        .send(pubBody)
      const briefingId = pubRes.body.data.id

      // Acknowledge
      const ackH = signedHeaders('POST', `/api/v1/briefings/${briefingId}/ack`, alice.clawId, alice.keys.privateKey)
      const ackRes = await request(tc.app)
        .post(`/api/v1/briefings/${briefingId}/ack`)
        .set(ackH)

      expect(ackRes.status).toBe(200)
      expect(ackRes.body.success).toBe(true)
    })

    it('should return 404 for non-existent briefing id', async () => {
      const h = signedHeaders('POST', '/api/v1/briefings/brief_nonexist/ack', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .post('/api/v1/briefings/brief_nonexist/ack')
        .set(h)

      expect(res.status).toBe(404)
    })
  })
})
