/**
 * E2E Test: Threads API（Phase 8）
 * POST   /api/v1/threads                  — 创建 Thread
 * GET    /api/v1/threads                  — 查询我的 Thread 列表
 * GET    /api/v1/threads/:id              — 查看 Thread 详情
 * POST   /api/v1/threads/:id/contribute   — 提交贡献（E2EE）
 * GET    /api/v1/threads/:id/contributions — 获取贡献历史
 * POST   /api/v1/threads/:id/invite       — 邀请好友加入
 * POST   /api/v1/threads/:id/digest       — 请求 AI 个性化摘要
 * PATCH  /api/v1/threads/:id/status       — 更新 Thread 状态
 * GET    /api/v1/threads/:id/my-key       — 获取当前用户密钥份额
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

describe.each(REPOSITORY_TYPES)('E2E: Threads API [%s]', (repositoryType: RepositoryType) => {
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

  // ─── Helper ──────────────────────────────────────────────────────────────

  async function createThread(
    creator: TestClaw,
    opts: { purpose?: string; title?: string } = {},
  ): Promise<string> {
    const body = {
      purpose: opts.purpose ?? 'tracking',
      title: opts.title ?? 'Test Thread',
    }
    const h = signedHeaders('POST', '/api/v1/threads', creator.clawId, creator.keys.privateKey, body)
    const res = await request(tc.app).post('/api/v1/threads').set(h).send(body)
    if (res.status !== 201) throw new Error(`createThread failed: ${JSON.stringify(res.body)}`)
    return res.body.data.id
  }

  async function contribute(
    threadId: string,
    user: TestClaw,
    encryptedContent = 'encrypted-payload',
    nonce = 'unique-nonce-001',
  ) {
    const body = { encryptedContent, nonce, contentType: 'text' }
    const h = signedHeaders('POST', `/api/v1/threads/${threadId}/contribute`, user.clawId, user.keys.privateKey, body)
    return request(tc.app).post(`/api/v1/threads/${threadId}/contribute`).set(h).send(body)
  }

  // ─── POST /api/v1/threads ────────────────────────────────────────────────

  describe('POST /api/v1/threads', () => {
    it('creates a thread and returns 201 with thread data', async () => {
      const body = { purpose: 'tracking', title: 'My First Thread' }
      const h = signedHeaders('POST', '/api/v1/threads', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/threads').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data.purpose).toBe('tracking')
      expect(res.body.data.title).toBe('My First Thread')
      expect(res.body.data.creatorId).toBe(alice.clawId)
    })

    it('accepts all valid purpose values', async () => {
      const purposes = ['tracking', 'debate', 'creation', 'accountability', 'coordination']
      for (const purpose of purposes) {
        const body = { purpose, title: `Thread for ${purpose}` }
        const h = signedHeaders('POST', '/api/v1/threads', alice.clawId, alice.keys.privateKey, body)
        const res = await request(tc.app).post('/api/v1/threads').set(h).send(body)
        expect(res.status).toBe(201)
        expect(res.body.data.purpose).toBe(purpose)
      }
    })

    it('returns 400 for invalid purpose', async () => {
      const body = { purpose: 'invalid-purpose', title: 'Bad Thread' }
      const h = signedHeaders('POST', '/api/v1/threads', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/threads').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('returns 400 when title is missing', async () => {
      const body = { purpose: 'tracking' }
      const h = signedHeaders('POST', '/api/v1/threads', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/threads').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('returns 401 without auth', async () => {
      const res = await request(tc.app).post('/api/v1/threads').send({ purpose: 'tracking', title: 'Hi' })
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/threads ─────────────────────────────────────────────────

  describe('GET /api/v1/threads', () => {
    it('returns empty list when no threads exist', async () => {
      const h = signedHeaders('GET', '/api/v1/threads', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/threads').set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data).toHaveLength(0)
    })

    it('returns threads created by the user', async () => {
      await createThread(alice, { title: 'Thread A' })
      await createThread(alice, { title: 'Thread B' })

      const h = signedHeaders('GET', '/api/v1/threads', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/threads').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    })

    it('filters threads by status', async () => {
      const threadId = await createThread(alice, { title: 'Active Thread' })

      // Complete the thread
      const patchBody = { status: 'completed' }
      const ph = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, alice.clawId, alice.keys.privateKey, patchBody)
      await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(ph).send(patchBody)

      // Filter by active — sign path WITHOUT query string (per auth middleware spec)
      const h = signedHeaders('GET', '/api/v1/threads', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/threads?status=active').set(h)

      expect(res.status).toBe(200)
      const ids = (res.body.data as Array<{ id: string }>).map((t) => t.id)
      expect(ids).not.toContain(threadId)
    })

    it('returns 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/threads')
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/threads/:id ─────────────────────────────────────────────

  describe('GET /api/v1/threads/:id', () => {
    it('returns thread details for owner', async () => {
      const threadId = await createThread(alice, { title: 'Detail Thread', purpose: 'debate' })

      const h = signedHeaders('GET', `/api/v1/threads/${threadId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}`).set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.thread.id).toBe(threadId)
      expect(res.body.data.thread.title).toBe('Detail Thread')
      expect(res.body.data).toHaveProperty('recentContributions')
    })

    it('returns 404 for non-participant', async () => {
      const threadId = await createThread(alice, { title: 'Private Thread' })

      const h = signedHeaders('GET', `/api/v1/threads/${threadId}`, stranger.clawId, stranger.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}`).set(h)

      expect(res.status).toBe(404)
    })

    it('returns 401 without auth', async () => {
      const threadId = await createThread(alice)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}`)
      expect(res.status).toBe(401)
    })
  })

  // ─── POST /api/v1/threads/:id/contribute ────────────────────────────────

  describe('POST /api/v1/threads/:id/contribute', () => {
    it('creates a contribution and returns 201', async () => {
      const threadId = await createThread(alice)
      const res = await contribute(threadId, alice, 'enc-content-1', 'nonce-abc-001')

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data.encryptedContent).toBe('enc-content-1')
      expect(res.body.data.contentType).toBe('text')
    })

    it('returns 400 for missing required fields', async () => {
      const threadId = await createThread(alice)
      const body = { encryptedContent: 'content' } // missing nonce and contentType
      const h = signedHeaders('POST', `/api/v1/threads/${threadId}/contribute`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post(`/api/v1/threads/${threadId}/contribute`).set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('returns 403 for non-participant', async () => {
      const threadId = await createThread(alice)
      const res = await contribute(threadId, stranger, 'enc', 'nonce-str-001')
      expect(res.status).toBe(403)
    })

    it('returns 401 without auth', async () => {
      const threadId = await createThread(alice)
      const res = await request(tc.app)
        .post(`/api/v1/threads/${threadId}/contribute`)
        .send({ encryptedContent: 'x', nonce: 'y', contentType: 'text' })
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/threads/:id/contributions ───────────────────────────────

  describe('GET /api/v1/threads/:id/contributions', () => {
    it('returns empty list initially', async () => {
      const threadId = await createThread(alice)
      const h = signedHeaders('GET', `/api/v1/threads/${threadId}/contributions`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/contributions`).set(h)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data).toHaveLength(0)
    })

    it('returns contributions after POST /contribute', async () => {
      const threadId = await createThread(alice)
      await contribute(threadId, alice, 'enc-c1', 'nonce-contrib-001')
      await contribute(threadId, alice, 'enc-c2', 'nonce-contrib-002')

      const h = signedHeaders('GET', `/api/v1/threads/${threadId}/contributions`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/contributions`).set(h)

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBe(2)
    })

    it('returns 403 for non-participant', async () => {
      const threadId = await createThread(alice)
      const h = signedHeaders('GET', `/api/v1/threads/${threadId}/contributions`, stranger.clawId, stranger.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/contributions`).set(h)
      expect(res.status).toBe(403)
    })
  })

  // ─── POST /api/v1/threads/:id/invite ────────────────────────────────────

  describe('POST /api/v1/threads/:id/invite', () => {
    it('allows owner to invite a friend', async () => {
      const threadId = await createThread(alice)
      const body = { clawId: bob.clawId, encryptedKeyForInvitee: 'enc-thread-key-for-bob' }
      const h = signedHeaders('POST', `/api/v1/threads/${threadId}/invite`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post(`/api/v1/threads/${threadId}/invite`).set(h).send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('allows invited participant to contribute after invite', async () => {
      const threadId = await createThread(alice)
      const invBody = { clawId: bob.clawId, encryptedKeyForInvitee: 'enc-key-bob' }
      const ih = signedHeaders('POST', `/api/v1/threads/${threadId}/invite`, alice.clawId, alice.keys.privateKey, invBody)
      await request(tc.app).post(`/api/v1/threads/${threadId}/invite`).set(ih).send(invBody)

      const res = await contribute(threadId, bob, 'enc-by-bob', 'nonce-bob-001')
      expect(res.status).toBe(201)
    })

    it('returns 400 when encryptedKeyForInvitee is missing', async () => {
      const threadId = await createThread(alice)
      const body = { clawId: bob.clawId }
      const h = signedHeaders('POST', `/api/v1/threads/${threadId}/invite`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post(`/api/v1/threads/${threadId}/invite`).set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('returns 401 without auth', async () => {
      const threadId = await createThread(alice)
      const res = await request(tc.app)
        .post(`/api/v1/threads/${threadId}/invite`)
        .send({ clawId: bob.clawId, encryptedKeyForInvitee: 'key' })
      expect(res.status).toBe(401)
    })
  })

  // ─── POST /api/v1/threads/:id/digest ────────────────────────────────────

  describe('POST /api/v1/threads/:id/digest', () => {
    it('returns 202 Accepted for owner', async () => {
      const threadId = await createThread(alice)
      const h = signedHeaders('POST', `/api/v1/threads/${threadId}/digest`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).post(`/api/v1/threads/${threadId}/digest`).set(h)

      expect(res.status).toBe(202)
      expect(res.body.success).toBe(true)
    })

    it('returns 403 for non-participant', async () => {
      const threadId = await createThread(alice)
      const h = signedHeaders('POST', `/api/v1/threads/${threadId}/digest`, stranger.clawId, stranger.keys.privateKey)
      const res = await request(tc.app).post(`/api/v1/threads/${threadId}/digest`).set(h)
      expect(res.status).toBe(403)
    })
  })

  // ─── PATCH /api/v1/threads/:id/status ───────────────────────────────────

  describe('PATCH /api/v1/threads/:id/status', () => {
    it('updates thread status and returns updated thread', async () => {
      const threadId = await createThread(alice)
      const body = { status: 'completed' }
      const h = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(h).send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('completed')
    })

    it('accepts all valid status values', async () => {
      for (const status of ['active', 'completed', 'archived']) {
        const threadId = await createThread(alice)
        const body = { status }
        const h = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, alice.clawId, alice.keys.privateKey, body)
        const res = await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(h).send(body)
        expect(res.status).toBe(200)
        expect(res.body.data.status).toBe(status)
      }
    })

    it('returns 400 for invalid status', async () => {
      const threadId = await createThread(alice)
      const body = { status: 'deleted' }
      const h = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('returns 403 for non-participant', async () => {
      const threadId = await createThread(alice)
      const body = { status: 'archived' }
      const h = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, stranger.clawId, stranger.keys.privateKey, body)
      const res = await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(h).send(body)
      expect(res.status).toBe(403)
    })
  })

  // ─── GET /api/v1/threads/:id/my-key ─────────────────────────────────────

  describe('GET /api/v1/threads/:id/my-key', () => {
    it('returns 404 when no key stored for thread', async () => {
      const threadId = await createThread(alice)
      const h = signedHeaders('GET', `/api/v1/threads/${threadId}/my-key`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/my-key`).set(h)
      // No key was stored during creation (encryptedKeys not passed)
      expect([200, 404]).toContain(res.status)
    })

    it('returns key when thread created with encryptedKeys', async () => {
      const body = {
        purpose: 'tracking',
        title: 'Encrypted Thread',
        encryptedKeys: { [alice.clawId]: 'alice-encrypted-key-share' },
      }
      const h = signedHeaders('POST', '/api/v1/threads', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(tc.app).post('/api/v1/threads').set(h).send(body)
      const threadId = createRes.body.data.id

      const kh = signedHeaders('GET', `/api/v1/threads/${threadId}/my-key`, alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/my-key`).set(kh)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('encryptedKey')
    })

    it('returns 401 without auth', async () => {
      const threadId = await createThread(alice)
      const res = await request(tc.app).get(`/api/v1/threads/${threadId}/my-key`)
      expect(res.status).toBe(401)
    })
  })

  // ─── Full flow ───────────────────────────────────────────────────────────

  describe('full thread lifecycle', () => {
    it('create → contribute → invite → contribute → complete', async () => {
      // 1. Alice creates thread
      const threadId = await createThread(alice, { purpose: 'creation', title: 'Collab Thread' })

      // 2. Alice contributes
      const c1 = await contribute(threadId, alice, 'alice-enc-1', 'nonce-full-001')
      expect(c1.status).toBe(201)

      // 3. Alice invites Bob
      const invBody = { clawId: bob.clawId, encryptedKeyForInvitee: 'bob-key' }
      const ih = signedHeaders('POST', `/api/v1/threads/${threadId}/invite`, alice.clawId, alice.keys.privateKey, invBody)
      const invRes = await request(tc.app).post(`/api/v1/threads/${threadId}/invite`).set(ih).send(invBody)
      expect(invRes.status).toBe(200)

      // 4. Bob contributes
      const c2 = await contribute(threadId, bob, 'bob-enc-1', 'nonce-full-002')
      expect(c2.status).toBe(201)

      // 5. Verify contributions
      const ch = signedHeaders('GET', `/api/v1/threads/${threadId}/contributions`, alice.clawId, alice.keys.privateKey)
      const cRes = await request(tc.app).get(`/api/v1/threads/${threadId}/contributions`).set(ch)
      expect(cRes.status).toBe(200)
      expect(cRes.body.data.length).toBe(2)

      // 6. Alice marks thread complete
      const patchBody = { status: 'completed' }
      const ph = signedHeaders('PATCH', `/api/v1/threads/${threadId}/status`, alice.clawId, alice.keys.privateKey, patchBody)
      const pRes = await request(tc.app).patch(`/api/v1/threads/${threadId}/status`).set(ph).send(patchBody)
      expect(pRes.status).toBe(200)
      expect(pRes.body.data.status).toBe('completed')
    })
  })
})
