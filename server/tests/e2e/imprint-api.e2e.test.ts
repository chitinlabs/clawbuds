/**
 * E2E Test: Imprint API（Phase 5）
 * POST /api/v1/imprints, GET /api/v1/imprints
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

describe.each(REPOSITORY_TYPES)('E2E: Imprint API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── POST /api/v1/imprints ────────────────────────────────────────────────
  describe('POST /api/v1/imprints', () => {
    it('should create an imprint and return 201', async () => {
      const body = { friendId: 'friend-1', eventType: 'new_job', summary: 'Alice got a new job' }
      const h = signedHeaders('POST', '/api/v1/imprints', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/imprints')
        .set(h)
        .send(body)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toMatch(/^imp_/)
      expect(res.body.data.eventType).toBe('new_job')
    })

    it('should return 400 for invalid eventType', async () => {
      const body = { friendId: 'friend-1', eventType: 'invalid_type', summary: 'test' }
      const h = signedHeaders('POST', '/api/v1/imprints', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/imprints')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
    })

    it('should return 400 for summary longer than 200 chars', async () => {
      const body = { friendId: 'friend-1', eventType: 'other', summary: 'x'.repeat(201) }
      const h = signedHeaders('POST', '/api/v1/imprints', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/imprints')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app)
        .post('/api/v1/imprints')
        .send({ friendId: 'friend-1', eventType: 'new_job', summary: 'test' })
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/imprints ─────────────────────────────────────────────────
  describe('GET /api/v1/imprints', () => {
    it('should return empty list when no imprints', async () => {
      const h = signedHeaders('GET', '/api/v1/imprints', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/imprints?friendId=friend-1')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return 400 when friendId is missing', async () => {
      const h = signedHeaders('GET', '/api/v1/imprints', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/imprints').set(h)
      expect(res.status).toBe(400)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/imprints?friendId=friend-1')
      expect(res.status).toBe(401)
    })
  })
})
