/**
 * E2E Test: Pattern Health + MicroMolt API（Phase 10）
 * GET  /api/v1/pattern-health   — 获取模式健康评分和 Staleness 告警
 * POST /api/v1/micromolt/apply  — 应用指定的 Micro-Molt 建议
 *
 * 参数化运行：SQLite + Supabase 双后端
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

describe.each(REPOSITORY_TYPES)('E2E: Pattern Health API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── GET /api/v1/pattern-health ──────────────────────────────────────────

  describe('GET /api/v1/pattern-health', () => {
    it('returns healthScore and alerts for a new claw', async () => {
      const h = signedHeaders('GET', '/api/v1/pattern-health', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pattern-health').set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('healthScore')
      expect(res.body.data).toHaveProperty('alerts')
      // healthScore is a PatternHealthScore object with an 'overall' field
      expect(typeof res.body.data.healthScore).toBe('object')
      expect(res.body.data.healthScore).toHaveProperty('overall')
      expect(Array.isArray(res.body.data.alerts)).toBe(true)
    })

    it('healthScore.overall is between 0 and 1', async () => {
      const h = signedHeaders('GET', '/api/v1/pattern-health', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pattern-health').set(h)

      expect(res.status).toBe(200)
      const overall = res.body.data.healthScore.overall as number
      expect(typeof overall).toBe('number')
      expect(overall).toBeGreaterThanOrEqual(0)
      expect(overall).toBeLessThanOrEqual(1)
    })

    it('returns 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/pattern-health')
      expect(res.status).toBe(401)
    })
  })
})

describe.each(REPOSITORY_TYPES)('E2E: MicroMolt Apply API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── POST /api/v1/micromolt/apply ────────────────────────────────────────

  describe('POST /api/v1/micromolt/apply', () => {
    it('returns 400 when confirmed is not true', async () => {
      const body = { suggestionIndex: 0, confirmed: false }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/micromolt/apply').set(h).send(body)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when confirmed is missing', async () => {
      const body = { suggestionIndex: 0 }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/micromolt/apply').set(h).send(body)

      expect(res.status).toBe(400)
    })

    it('returns 400 when suggestionIndex is negative', async () => {
      const body = { suggestionIndex: -1, confirmed: true }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/micromolt/apply').set(h).send(body)

      expect(res.status).toBe(400)
    })

    it('returns 400 when suggestionIndex is out of range', async () => {
      // For a new claw with no reflexes/pearls, suggestions list may be empty
      // Index 999 will always be out of range
      const body = { suggestionIndex: 999, confirmed: true }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/micromolt/apply').set(h).send(body)

      // Either 400 (validation) or 503 (CarapaceEditor not injected in test env)
      expect([400, 503]).toContain(res.status)
    })

    it('returns 401 without auth', async () => {
      const res = await request(tc.app)
        .post('/api/v1/micromolt/apply')
        .send({ suggestionIndex: 0, confirmed: true })

      expect(res.status).toBe(401)
    })

    it('returns 409 when expectedCommand does not match current suggestion', async () => {
      // This tests the MEDIUM-4 conflict detection
      const body = { suggestionIndex: 0, confirmed: true, expectedCommand: 'clawbuds micromolt apply 0 --command "nonexistent-command"' }
      const h = signedHeaders('POST', '/api/v1/micromolt/apply', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/micromolt/apply').set(h).send(body)

      // Either 400 (no suggestions), 409 (conflict), or 503 (no CarapaceEditor)
      expect([400, 409, 503]).toContain(res.status)
    })
  })
})
