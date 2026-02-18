/**
 * E2E Test: Friend Models API Flow（Phase 2）
 * 测试 GET /api/v1/friend-models 和 GET /api/v1/friend-models/:friendId
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

describe.each(REPOSITORY_TYPES)('E2E: Friend Models API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw
  let bob: TestClaw
  let charlie: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    charlie = await registerClaw(tc.app, 'Charlie')
    await makeFriends(tc.app, alice, bob)
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/friend-models
  // ─────────────────────────────────────────────
  describe('GET /api/v1/friend-models', () => {
    it('should return all friend models for authenticated claw', async () => {
      const h = signedHeaders('GET', '/api/v1/friend-models', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app)
        .get('/api/v1/friend-models')
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      // Bob is Alice's friend → should have a model
      expect(res.body.data.length).toBeGreaterThanOrEqual(1)
      const bobModel = res.body.data.find((m: any) => m.friendId === bob.clawId)
      expect(bobModel).toBeDefined()
    })

    it('should return model with correct null initial fields', async () => {
      const h = signedHeaders('GET', '/api/v1/friend-models', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app)
        .get('/api/v1/friend-models')
        .set(h)

      const bobModel = res.body.data.find((m: any) => m.friendId === bob.clawId)
      expect(bobModel.lastKnownState).toBeNull()
      expect(bobModel.inferredInterests).toEqual([])
      expect(bobModel.expertiseTags).toEqual({})
      expect(bobModel.lastHeartbeatAt).toBeNull()
      expect(bobModel.emotionalTone).toBeNull()
      expect(bobModel.inferredNeeds).toBeNull()
      expect(bobModel.knowledgeGaps).toBeNull()
    })

    it('should return 401 when not authenticated', async () => {
      const res = await request(tc.app).get('/api/v1/friend-models')
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/friend-models/:friendId
  // ─────────────────────────────────────────────
  describe('GET /api/v1/friend-models/:friendId', () => {
    it('should return model for a valid friend', async () => {
      const h = signedHeaders('GET', `/api/v1/friend-models/${bob.clawId}`, alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app)
        .get(`/api/v1/friend-models/${bob.clawId}`)
        .set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.friendId).toBe(bob.clawId)
    })

    it('should return 403 when querying a non-friend', async () => {
      const h = signedHeaders('GET', `/api/v1/friend-models/${charlie.clawId}`, alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app)
        .get(`/api/v1/friend-models/${charlie.clawId}`)
        .set(h)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_FRIENDS')
    })

    it('should return 404 for non-existent friendId when not friends', async () => {
      const h = signedHeaders('GET', '/api/v1/friend-models/nonexistent-id', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app)
        .get('/api/v1/friend-models/nonexistent-id')
        .set(h)

      // non-existent id → not friends → 403
      expect([403, 404]).toContain(res.status)
    })

    it('should return 401 when not authenticated', async () => {
      const res = await request(tc.app).get(`/api/v1/friend-models/${bob.clawId}`)
      expect(res.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // heartbeat 更新后的 GET 查询
  // ─────────────────────────────────────────────
  describe('after heartbeat', () => {
    it('should reflect updated inferredInterests after heartbeat', async () => {
      // Bob sends heartbeat to Alice
      const hbBody = {
        interests: ['Rust', 'Systems'],
        recentTopics: '最近在研究异步',
        isKeepalive: false,
      }
      const hbHeaders = signedHeaders('POST', '/api/v1/heartbeat', bob.clawId, bob.keys.privateKey, hbBody)
      await request(tc.app)
        .post('/api/v1/heartbeat')
        .set(hbHeaders)
        .set('X-Target-Claw-Id', alice.clawId)
        .send(hbBody)

      // Wait for async event handling (Supabase needs more time than SQLite)
      await new Promise((r) => setTimeout(r, 300))

      // Alice queries Bob's model
      const h = signedHeaders('GET', `/api/v1/friend-models/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/friend-models/${bob.clawId}`).set(h)

      expect(res.status).toBe(200)
      expect(res.body.data.inferredInterests).toEqual(['Rust', 'Systems'])
      expect(res.body.data.lastKnownState).toBe('最近在研究异步')
    })
  })
})
