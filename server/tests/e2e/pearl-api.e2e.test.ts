/**
 * E2E Test: Pearl API Flow（Phase 3）
 * 测试 POST/GET/PATCH/DELETE /api/v1/pearls + share + endorse + received
 * 参数化运行：SQLite + Supabase（双后端覆盖）
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

describe.each(REPOSITORY_TYPES)('E2E: Pearl API [%s]', (repositoryType: RepositoryType) => {
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

  // ─── POST /api/v1/pearls ─────────────────────────────────────────────────
  describe('POST /api/v1/pearls', () => {
    it('should create a pearl with required fields', async () => {
      const body = {
        type: 'insight',
        triggerText: '用增量迭代替代完美设计',
        domainTags: ['产品', '方法论'],
      }
      const h = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app).post('/api/v1/pearls').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.type).toBe('insight')
      expect(res.body.data.triggerText).toBe('用增量迭代替代完美设计')
      expect(res.body.data.ownerId).toBe(alice.clawId)
      expect(res.body.data.luster).toBe(0.5)
      expect(res.body.data.originType).toBe('manual')
    })

    it('should return 400 when triggerText exceeds 100 chars', async () => {
      const body = {
        type: 'insight',
        triggerText: 'a'.repeat(101),
      }
      const h = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/pearls').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should return 400 when domainTags exceeds 10', async () => {
      const body = {
        type: 'insight',
        triggerText: 'test',
        domainTags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      }
      const h = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/pearls').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).post('/api/v1/pearls').send({ type: 'insight', triggerText: 'test' })
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/pearls ──────────────────────────────────────────────────
  describe('GET /api/v1/pearls', () => {
    it('should return empty list when no pearls', async () => {
      const h = signedHeaders('GET', '/api/v1/pearls', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pearls').set(h)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual([])
      expect(res.body.meta).toBeDefined()
    })

    it('should list owner\'s pearls (Level 0)', async () => {
      const createBody = { type: 'insight', triggerText: 'test pearl' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)

      const hGet = signedHeaders('GET', '/api/v1/pearls', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pearls').set(hGet)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      // Level 0: should NOT have body field
      expect(res.body.data[0].body).toBeUndefined()
    })
  })

  // ─── GET /api/v1/pearls/received ────────────────────────────────────────
  describe('GET /api/v1/pearls/received', () => {
    it('should return empty list when no pearls received', async () => {
      const h = signedHeaders('GET', '/api/v1/pearls/received', bob.clawId, bob.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pearls/received').set(h)
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('should return received pearl after share', async () => {
      // Alice creates a pearl
      const createBody = { type: 'insight', triggerText: 'shared insight', shareability: 'friends_only' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      // Alice shares with Bob
      const shareBody = { toClawId: bob.clawId }
      const hShare = signedHeaders('POST', `/api/v1/pearls/${pearlId}/share`, alice.clawId, alice.keys.privateKey, shareBody)
      await request(tc.app).post(`/api/v1/pearls/${pearlId}/share`).set(hShare).send(shareBody)

      // Bob checks received pearls
      const hReceived = signedHeaders('GET', '/api/v1/pearls/received', bob.clawId, bob.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pearls/received').set(hReceived)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].pearl.id).toBe(pearlId)
      expect(res.body.data[0].share.fromClawId).toBe(alice.clawId)
    })
  })

  // ─── GET /api/v1/pearls/:id ──────────────────────────────────────────────
  describe('GET /api/v1/pearls/:id', () => {
    it('should return pearl at level=1 by default', async () => {
      const createBody = { type: 'insight', triggerText: 'test', body: 'body content' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const hGet = signedHeaders('GET', `/api/v1/pearls/${pearlId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/pearls/${pearlId}`).set(hGet)

      expect(res.status).toBe(200)
      expect(res.body.data.body).toBe('body content')
      expect(res.body.data.originType).toBe('manual')
    })

    it('should return level=0 when ?level=0', async () => {
      const createBody = { type: 'insight', triggerText: 'test', body: 'body content' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      // Sign WITHOUT query string (server strips query string before verification)
      const hGet = signedHeaders('GET', `/api/v1/pearls/${pearlId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/pearls/${pearlId}?level=0`).set(hGet)

      expect(res.status).toBe(200)
      expect(res.body.data.body).toBeUndefined()
    })

    it('should return 403 for private pearl not owned by requester', async () => {
      const createBody = { type: 'insight', triggerText: 'private', shareability: 'private' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const hGet = signedHeaders('GET', `/api/v1/pearls/${pearlId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/pearls/${pearlId}`).set(hGet)

      expect(res.status).toBe(403)
    })

    it('should return 404 for non-existent pearl', async () => {
      const h = signedHeaders('GET', '/api/v1/pearls/non-existent-id', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/pearls/non-existent-id').set(h)
      expect(res.status).toBe(404)
    })
  })

  // ─── PATCH /api/v1/pearls/:id ────────────────────────────────────────────
  describe('PATCH /api/v1/pearls/:id', () => {
    it('should update pearl fields', async () => {
      const createBody = { type: 'insight', triggerText: 'original' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const updateBody = { triggerText: 'updated trigger', body: 'new body' }
      const hPatch = signedHeaders('PATCH', `/api/v1/pearls/${pearlId}`, alice.clawId, alice.keys.privateKey, updateBody)
      const res = await request(tc.app).patch(`/api/v1/pearls/${pearlId}`).set(hPatch).send(updateBody)

      expect(res.status).toBe(200)
      expect(res.body.data.triggerText).toBe('updated trigger')
      expect(res.body.data.body).toBe('new body')
    })

    it('should return 403 when non-owner tries to update', async () => {
      const createBody = { type: 'insight', triggerText: 'original' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const hPatch = signedHeaders('PATCH', `/api/v1/pearls/${pearlId}`, bob.clawId, bob.keys.privateKey, {})
      const res = await request(tc.app).patch(`/api/v1/pearls/${pearlId}`).set(hPatch).send({})

      expect(res.status).toBe(403)
    })
  })

  // ─── DELETE /api/v1/pearls/:id ───────────────────────────────────────────
  describe('DELETE /api/v1/pearls/:id', () => {
    it('should delete pearl', async () => {
      const createBody = { type: 'insight', triggerText: 'to delete' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const hDel = signedHeaders('DELETE', `/api/v1/pearls/${pearlId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).delete(`/api/v1/pearls/${pearlId}`).set(hDel)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should return 403 when non-owner tries to delete', async () => {
      const createBody = { type: 'insight', triggerText: 'test' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const hDel = signedHeaders('DELETE', `/api/v1/pearls/${pearlId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(tc.app).delete(`/api/v1/pearls/${pearlId}`).set(hDel)

      expect(res.status).toBe(403)
    })
  })

  // ─── POST /api/v1/pearls/:id/share ───────────────────────────────────────
  describe('POST /api/v1/pearls/:id/share', () => {
    it('should share pearl with friend', async () => {
      const createBody = { type: 'insight', triggerText: 'shareable', shareability: 'friends_only' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const shareBody = { toClawId: bob.clawId }
      const hShare = signedHeaders('POST', `/api/v1/pearls/${pearlId}/share`, alice.clawId, alice.keys.privateKey, shareBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/share`).set(hShare).send(shareBody)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should return 400 for private pearl', async () => {
      const createBody = { type: 'insight', triggerText: 'private', shareability: 'private' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const shareBody = { toClawId: bob.clawId }
      const hShare = signedHeaders('POST', `/api/v1/pearls/${pearlId}/share`, alice.clawId, alice.keys.privateKey, shareBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/share`).set(hShare).send(shareBody)

      expect(res.status).toBe(400)
    })

    it('should be idempotent (200 on repeat share)', async () => {
      const createBody = { type: 'insight', triggerText: 'shareable', shareability: 'friends_only' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const shareBody = { toClawId: bob.clawId }
      const hShare1 = signedHeaders('POST', `/api/v1/pearls/${pearlId}/share`, alice.clawId, alice.keys.privateKey, shareBody)
      await request(tc.app).post(`/api/v1/pearls/${pearlId}/share`).set(hShare1).send(shareBody)

      const hShare2 = signedHeaders('POST', `/api/v1/pearls/${pearlId}/share`, alice.clawId, alice.keys.privateKey, shareBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/share`).set(hShare2).send(shareBody)

      expect(res.status).toBe(200)
    })
  })

  // ─── POST /api/v1/pearls/:id/endorse ─────────────────────────────────────
  describe('POST /api/v1/pearls/:id/endorse', () => {
    it('should endorse pearl and return newLuster', async () => {
      // Alice creates public pearl
      const createBody = { type: 'insight', triggerText: 'test', shareability: 'public' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      // Bob endorses
      const endorseBody = { score: 0.9, comment: 'great insight' }
      const hEndorse = signedHeaders('POST', `/api/v1/pearls/${pearlId}/endorse`, bob.clawId, bob.keys.privateKey, endorseBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/endorse`).set(hEndorse).send(endorseBody)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.endorsement).toBeDefined()
      expect(res.body.data.newLuster).toBeDefined()
      // (0.5 + 0.9) / 2 = 0.7
      expect(res.body.data.newLuster).toBeCloseTo(0.7, 1)
    })

    it('should return 400 when owner tries to endorse own pearl', async () => {
      const createBody = { type: 'insight', triggerText: 'test', shareability: 'public' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const endorseBody = { score: 0.9 }
      const hEndorse = signedHeaders('POST', `/api/v1/pearls/${pearlId}/endorse`, alice.clawId, alice.keys.privateKey, endorseBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/endorse`).set(hEndorse).send(endorseBody)

      expect(res.status).toBe(400)
    })

    it('should return 403 when endorser cannot see pearl', async () => {
      const createBody = { type: 'insight', triggerText: 'test', shareability: 'private' }
      const hPost = signedHeaders('POST', '/api/v1/pearls', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(tc.app).post('/api/v1/pearls').set(hPost).send(createBody)
      const pearlId = createRes.body.data.id

      const endorseBody = { score: 0.9 }
      const hEndorse = signedHeaders('POST', `/api/v1/pearls/${pearlId}/endorse`, bob.clawId, bob.keys.privateKey, endorseBody)
      const res = await request(tc.app).post(`/api/v1/pearls/${pearlId}/endorse`).set(hEndorse).send(endorseBody)

      expect(res.status).toBe(403)
    })
  })
})
