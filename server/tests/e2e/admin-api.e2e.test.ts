/**
 * E2E Test: Admin API（Phase 12c T12c-2）
 * GET  /admin/health/detail       — 完整健康状态
 * GET  /admin/claws               — Claw 列表
 * GET  /admin/claws/:id           — 单个 Claw 详情
 * PATCH /admin/claws/:id/status   — 更改 Claw 状态
 * GET  /admin/stats/overview      — 系统统计
 * GET  /admin/webhooks/deliveries — 全局 Webhook 投递日志
 * GET  /admin/reflexes/stats      — Reflex 执行统计
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { TestContext, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

const ADMIN_KEY = 'test-admin-key-12345'

describe.each(REPOSITORY_TYPES)('E2E: Admin API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext

  beforeEach(async () => {
    process.env['CLAWBUDS_ADMIN_KEY'] = ADMIN_KEY
    tc = createTestContext({ repositoryType })
    // Register a claw for testing
    await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
    delete process.env['CLAWBUDS_ADMIN_KEY']
  })

  // ─── 认证测试 ────────────────────────────────────────────────────────────

  describe('Admin Authentication', () => {
    it('should return 503 when CLAWBUDS_ADMIN_KEY is not set', async () => {
      delete process.env['CLAWBUDS_ADMIN_KEY']
      // Re-create context without admin key
      const tcNoKey = createTestContext({ repositoryType })
      const res = await request(tcNoKey.app)
        .get('/admin/health/detail')
        .set('Authorization', 'Bearer anything')
      expect(res.status).toBe(503)
      destroyTestContext(tcNoKey)
      // Restore for afterEach
      process.env['CLAWBUDS_ADMIN_KEY'] = ADMIN_KEY
    })

    it('should return 401 without auth header', async () => {
      const res = await request(tc.app).get('/admin/health/detail')
      expect(res.status).toBe(401)
    })

    it('should return 401 with wrong key', async () => {
      const res = await request(tc.app)
        .get('/admin/health/detail')
        .set('Authorization', 'Bearer wrong-key')
      expect(res.status).toBe(401)
    })

    it('should return 200 with correct key', async () => {
      const res = await request(tc.app)
        .get('/admin/health/detail')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
    })
  })

  // ─── GET /admin/health/detail ─────────────────────────────────────────

  describe('GET /admin/health/detail', () => {
    it('should return health status object', async () => {
      const res = await request(tc.app)
        .get('/admin/health/detail')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('db')
      expect(res.body.data).toHaveProperty('cache')
      expect(res.body.data).toHaveProperty('realtime')
      expect(res.body.data).toHaveProperty('uptime')
    })
  })

  // ─── GET /admin/claws ─────────────────────────────────────────────────

  describe('GET /admin/claws', () => {
    it('should return claw list with total', async () => {
      const res = await request(tc.app)
        .get('/admin/claws')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.total).toBe('number')
      expect(Array.isArray(res.body.data.claws)).toBe(true)
      expect(res.body.data.total).toBeGreaterThanOrEqual(1)
    })

    it('should support limit and offset params', async () => {
      const res = await request(tc.app)
        .get('/admin/claws?limit=5&offset=0')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.data.claws.length).toBeLessThanOrEqual(5)
    })
  })

  // ─── GET /admin/claws/:id ─────────────────────────────────────────────

  describe('GET /admin/claws/:id', () => {
    it('should return 404 for unknown claw', async () => {
      const res = await request(tc.app)
        .get('/admin/claws/nonexistent-claw-id')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(404)
    })
  })

  // ─── GET /admin/stats/overview ────────────────────────────────────────

  describe('GET /admin/stats/overview', () => {
    it('should return overview stats', async () => {
      const res = await request(tc.app)
        .get('/admin/stats/overview')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.totalClaws).toBe('number')
      expect(typeof res.body.data.totalMessages).toBe('number')
    })
  })

  // ─── GET /admin/webhooks/deliveries ───────────────────────────────────

  describe('GET /admin/webhooks/deliveries', () => {
    it('should return delivery list (may be empty)', async () => {
      const res = await request(tc.app)
        .get('/admin/webhooks/deliveries')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.deliveries)).toBe(true)
    })
  })

  // ─── GET /admin/reflexes/stats ────────────────────────────────────────

  describe('GET /admin/reflexes/stats', () => {
    it('should return reflex execution stats', async () => {
      const res = await request(tc.app)
        .get('/admin/reflexes/stats')
        .set('Authorization', `Bearer ${ADMIN_KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.total).toBe('number')
      expect(typeof res.body.data.allowed).toBe('number')
      expect(typeof res.body.data.blocked).toBe('number')
    })
  })
})
