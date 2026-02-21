/**
 * E2E Test: Carapace History API（Phase 10）
 * GET /api/v1/carapace/history
 * GET /api/v1/carapace/history/:version
 * POST /api/v1/carapace/restore/:version
 * GET /api/v1/pattern-health
 * POST /api/v1/micromolt/apply
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

describe.each(REPOSITORY_TYPES)('E2E: Carapace History API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── GET /api/v1/carapace/history ────────────────────────────────────────

  describe('GET /api/v1/carapace/history', () => {
    it('should return empty history when no records', async () => {
      const h = signedHeaders('GET', '/api/v1/carapace/history', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/carapace/history')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.meta).toBeDefined()
      expect(typeof res.body.meta.total).toBe('number')
      expect(typeof res.body.meta.latestVersion).toBe('number')
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/carapace/history')
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/carapace/history/:version ───────────────────────────────

  describe('GET /api/v1/carapace/history/:version', () => {
    it('should return 404 for non-existent version', async () => {
      const h = signedHeaders('GET', '/api/v1/carapace/history/999', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/carapace/history/999')
        .set(h)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('should return 400 for invalid version number', async () => {
      const h = signedHeaders('GET', '/api/v1/carapace/history/abc', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/carapace/history/abc')
        .set(h)

      expect(res.status).toBe(400)
    })
  })

  // ─── POST /api/v1/carapace/restore/:version ──────────────────────────────

  describe('POST /api/v1/carapace/restore/:version', () => {
    it('should return 404 when restoring non-existent version', async () => {
      const h = signedHeaders('POST', '/api/v1/carapace/restore/999', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .post('/api/v1/carapace/restore/999')
        .set(h)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })
  })

  // ─── GET /api/v1/pattern-health ──────────────────────────────────────────

  describe('GET /api/v1/pattern-health', () => {
    it('should return pattern health score', async () => {
      const h = signedHeaders('GET', '/api/v1/pattern-health', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/pattern-health')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.healthScore).toBeDefined()
      expect(typeof res.body.data.healthScore.overall).toBe('number')
      expect(Array.isArray(res.body.data.alerts)).toBe(true)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/pattern-health')
      expect(res.status).toBe(401)
    })
  })

  // ─── POST /api/v1/micromolt/apply ────────────────────────────────────────

  describe('POST /api/v1/micromolt/apply', () => {
    it('should return 400 when suggestion index out of range', async () => {
      const body = { suggestionIndex: 999, confirmed: true }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/micromolt/apply')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('should return 400 when confirmed is false', async () => {
      const body = { suggestionIndex: 0, confirmed: false }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/micromolt/apply')
        .set(h)
        .send(body)

      expect([400, 422]).toContain(res.status)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app)
        .post('/api/v1/micromolt/apply')
        .send({ suggestionIndex: 0, confirmed: true })
      expect(res.status).toBe(401)
    })
  })
})
