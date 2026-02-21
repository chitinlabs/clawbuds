/**
 * E2E Test: Draft API（Phase 11 T4）
 * POST   /api/v1/drafts
 * GET    /api/v1/drafts
 * GET    /api/v1/drafts/:id
 * POST   /api/v1/drafts/:id/approve
 * POST   /api/v1/drafts/:id/reject
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
  makeFriends,
  signedHeaders,
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)('E2E: Draft API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    await makeFriends(tc.app, alice, bob)
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── POST /api/v1/drafts ─────────────────────────────────────────────────

  describe('POST /api/v1/drafts', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).post('/api/v1/drafts')
        .send({ toClawId: bob.clawId, content: 'hi', reason: 'test' })
      expect(res.status).toBe(401)
    })

    it('should return 400 when toClawId is missing', async () => {
      const body = { content: 'hi', reason: 'test' }
      const h = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/drafts').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should create a pending draft', async () => {
      const body = { toClawId: bob.clawId, content: '你好，最近怎么样？', reason: 'groom_request' }
      const h = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/drafts').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('pending')
      expect(res.body.data.clawId).toBe(alice.clawId)
      expect(res.body.data.toClawId).toBe(bob.clawId)
    })
  })

  // ─── GET /api/v1/drafts ──────────────────────────────────────────────────

  describe('GET /api/v1/drafts', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/drafts')
      expect(res.status).toBe(401)
    })

    it('should return empty list initially', async () => {
      const h = signedHeaders('GET', '/api/v1/drafts', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/drafts').set(h)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBe(0)
    })

    it('should filter by status=pending', async () => {
      // Create a draft first
      const body = { toClawId: bob.clawId, content: 'test', reason: 'test' }
      const hPost = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      await request(tc.app).post('/api/v1/drafts').set(hPost).send(body)

      const h = signedHeaders('GET', '/api/v1/drafts', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/drafts?status=pending').set(h)
      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── POST /api/v1/drafts/:id/reject ──────────────────────────────────────

  describe('POST /api/v1/drafts/:id/reject', () => {
    it('should reject a pending draft', async () => {
      // Create draft
      const body = { toClawId: bob.clawId, content: 'test', reason: 'test' }
      const hPost = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(tc.app).post('/api/v1/drafts').set(hPost).send(body)
      const draftId = createRes.body.data.id

      // Reject
      const hReject = signedHeaders('POST', `/api/v1/drafts/${draftId}/reject`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).post(`/api/v1/drafts/${draftId}/reject`).set(hReject)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('rejected')
    })

    it('should return 404 for non-existent draft', async () => {
      const h = signedHeaders('POST', '/api/v1/drafts/non-existent/reject', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).post('/api/v1/drafts/non-existent/reject').set(h)
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /api/v1/drafts/:id/approve ────────────────────────────────────

  describe('POST /api/v1/drafts/:id/approve', () => {
    it('should approve and send message', async () => {
      // Create draft
      const body = { toClawId: bob.clawId, content: '最近好吗？', reason: 'groom_request' }
      const hPost = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(tc.app).post('/api/v1/drafts').set(hPost).send(body)
      const draftId = createRes.body.data.id

      // Approve
      const hApprove = signedHeaders('POST', `/api/v1/drafts/${draftId}/approve`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).post(`/api/v1/drafts/${draftId}/approve`).set(hApprove)

      expect(res.status).toBe(200)
      expect(res.body.data.draft.status).toBe('approved')
      expect(typeof res.body.data.messageId).toBe('string')
    })

    it('should return 409 when approving already approved draft', async () => {
      // Create + approve
      const body = { toClawId: bob.clawId, content: 'test', reason: 'test' }
      const hPost = signedHeaders('POST', '/api/v1/drafts', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(tc.app).post('/api/v1/drafts').set(hPost).send(body)
      const draftId = createRes.body.data.id

      const hApprove = signedHeaders('POST', `/api/v1/drafts/${draftId}/approve`, alice.clawId, alice.keys.privateKey)
      await request(tc.app).post(`/api/v1/drafts/${draftId}/approve`).set(hApprove)

      // Try again
      const h2 = signedHeaders('POST', `/api/v1/drafts/${draftId}/approve`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).post(`/api/v1/drafts/${draftId}/approve`).set(h2)
      expect(res.status).toBe(409)
    })
  })
})
