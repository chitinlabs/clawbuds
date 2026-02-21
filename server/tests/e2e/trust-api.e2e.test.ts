/**
 * E2E Test: Trust API（Phase 7）
 * GET  /api/v1/trust/:friendId           — 查看信任评分
 * POST /api/v1/trust/:friendId/endorse   — 手动背书
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
  makeFriends,
  signedHeaders,
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)('E2E: Trust API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw
  let stranger: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    stranger = await registerClaw(tc.app, 'Stranger')
    await makeFriends(tc.app, alice, bob)
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── GET /api/v1/trust/:friendId ─────────────────────────────────────────

  describe('GET /api/v1/trust/:friendId', () => {
    it('should return empty array for new friendship (no trust records yet)', async () => {
      const h = signedHeaders('GET', `/api/v1/trust/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get(`/api/v1/trust/${bob.clawId}`)
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return 404 for non-friend', async () => {
      const h = signedHeaders('GET', `/api/v1/trust/${stranger.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get(`/api/v1/trust/${stranger.clawId}`)
        .set(h)

      expect(res.status).toBe(404)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app)
        .get(`/api/v1/trust/${bob.clawId}`)

      expect(res.status).toBe(401)
    })
  })

  // ─── POST /api/v1/trust/:friendId/endorse ────────────────────────────────

  describe('POST /api/v1/trust/:friendId/endorse', () => {
    it('should set H score and return old/new composite', async () => {
      const body = { score: 0.9, domain: '_overall' }
      const h = signedHeaders('POST', `/api/v1/trust/${bob.clawId}/endorse`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post(`/api/v1/trust/${bob.clawId}/endorse`)
        .set(h)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('trustScore')
      expect(res.body.data).toHaveProperty('oldComposite')
      expect(res.body.data).toHaveProperty('newComposite')
    })

    it('should endorse with specific domain', async () => {
      const body = { score: 0.85, domain: 'AI', note: '顶级 AI 研究员' }
      const h = signedHeaders('POST', `/api/v1/trust/${bob.clawId}/endorse`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post(`/api/v1/trust/${bob.clawId}/endorse`)
        .set(h)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.data.trustScore.domain).toBe('AI')
    })

    it('should return 400 for invalid score (> 1.0)', async () => {
      const body = { score: 1.5 }
      const h = signedHeaders('POST', `/api/v1/trust/${bob.clawId}/endorse`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post(`/api/v1/trust/${bob.clawId}/endorse`)
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
    })

    it('should return 403 when endorsing non-friend', async () => {
      const body = { score: 0.9 }
      const h = signedHeaders('POST', `/api/v1/trust/${stranger.clawId}/endorse`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post(`/api/v1/trust/${stranger.clawId}/endorse`)
        .set(h)
        .send(body)

      expect(res.status).toBe(403)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app)
        .post(`/api/v1/trust/${bob.clawId}/endorse`)
        .send({ score: 0.9 })

      expect(res.status).toBe(401)
    })

    it('GET after endorse should return the endorsed record', async () => {
      // Endorse first
      const endorseBody = { score: 0.9, domain: '_overall' }
      const hEndorse = signedHeaders('POST', `/api/v1/trust/${bob.clawId}/endorse`, alice.clawId, alice.keys.privateKey, endorseBody)
      await request(tc.app)
        .post(`/api/v1/trust/${bob.clawId}/endorse`)
        .set(hEndorse)
        .send(endorseBody)

      // Then GET
      const hGet = signedHeaders('GET', `/api/v1/trust/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get(`/api/v1/trust/${bob.clawId}`)
        .set(hGet)

      expect(res.status).toBe(200)
      const records = res.body.data as any[]
      expect(records.length).toBeGreaterThan(0)
      const overall = records.find((r: any) => r.domain === '_overall')
      expect(overall).toBeDefined()
      expect(overall.hScore).toBeCloseTo(0.9, 2)
    })
  })
})
