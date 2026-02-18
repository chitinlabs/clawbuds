/**
 * E2E Test: Heartbeat API Flow（Phase 1）
 * 测试 POST /api/v1/heartbeat 和 GET /api/v1/heartbeat/:friendId
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

describe.each(REPOSITORY_TYPES)('E2E: Heartbeat API [%s]', (repositoryType: RepositoryType) => {
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

  // ─────────────────────────────────────────────
  // POST /api/v1/heartbeat
  // ─────────────────────────────────────────────
  describe('POST /api/v1/heartbeat', () => {
    it('should store heartbeat when friends', async () => {
      const body = {
        interests: ['tech', 'rust'],
        availability: '工作日',
        recentTopics: 'async programming',
        isKeepalive: false,
      }
      const h = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(h)
        .set('X-Target-Claw-Id', bob.clawId)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should return 400 when X-Target-Claw-Id header is missing', async () => {
      const body = { isKeepalive: true }
      const h = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MISSING_HEADER')
    })

    it('should return 400 when body fails validation', async () => {
      const body = { interests: 'not-an-array', isKeepalive: false }
      const h = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(h)
        .set('X-Target-Claw-Id', bob.clawId)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should return 403 when not friends', async () => {
      const charlie = await registerClaw(tc.app, 'Charlie')
      const body = { isKeepalive: false }
      const h = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(h)
        .set('X-Target-Claw-Id', charlie.clawId)
        .send(body)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_FRIENDS')
    })

    it('should return 401 without auth headers', async () => {
      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set('X-Target-Claw-Id', bob.clawId)
        .send({ isKeepalive: false })

      expect(res.status).toBe(401)
    })

    it('should accept keepalive heartbeat', async () => {
      const body = { isKeepalive: true }
      const h = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(h)
        .set('X-Target-Claw-Id', bob.clawId)
        .send(body)

      expect(res.status).toBe(200)
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/heartbeat/:friendId
  // ─────────────────────────────────────────────
  describe('GET /api/v1/heartbeat/:friendId', () => {
    it('should return 404 when no heartbeat from friend yet', async () => {
      const h = signedHeaders('GET', `/api/v1/heartbeat/${alice.clawId}`, bob.clawId, bob.keys.privateKey)

      const res = await request(tc.app)
        .get(`/api/v1/heartbeat/${alice.clawId}`)
        .set(h)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('should return latest heartbeat from friend', async () => {
      // Alice sends heartbeat to Bob
      const sendBody = {
        interests: ['music', 'travel'],
        recentTopics: 'guitar learning',
        isKeepalive: false,
      }
      const sendH = signedHeaders('POST', '/api/v1/heartbeat', alice.clawId, alice.keys.privateKey, sendBody)
      await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(sendH)
        .set('X-Target-Claw-Id', bob.clawId)
        .send(sendBody)

      // Bob retrieves Alice's heartbeat
      const getH = signedHeaders('GET', `/api/v1/heartbeat/${alice.clawId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(tc.app)
        .get(`/api/v1/heartbeat/${alice.clawId}`)
        .set(getH)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.fromClawId).toBe(alice.clawId)
      expect(res.body.data.interests).toEqual(['music', 'travel'])
      expect(res.body.data.recentTopics).toBe('guitar learning')
      expect(res.body.data.receivedAt).toBeDefined()
    })

    it('should return 401 without auth headers', async () => {
      const res = await request(tc.app).get(`/api/v1/heartbeat/${alice.clawId}`)
      expect(res.status).toBe(401)
    })
  })
})
