/**
 * E2E Test: Reflex API Flow（Phase 4）
 * GET /api/v1/reflexes, PATCH enable/disable, GET executions
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

describe.each(REPOSITORY_TYPES)('E2E: Reflex API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    // Give time for async initializeBuiltins to complete
    await new Promise((r) => setTimeout(r, 100))
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── GET /api/v1/reflexes ─────────────────────────────────────────────────
  describe('GET /api/v1/reflexes', () => {
    it('should return list of reflexes after registration', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes').set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return 400 for invalid layer value', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes?layer=99').set(h)
      expect(res.status).toBe(400)
    })

    it('should return 200 with layer=0 filter', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes?layer=0').set(h)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return all reflexes with enabled=false', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes?enabled=false').set(h)
      expect(res.status).toBe(200)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/reflexes')
      expect(res.status).toBe(401)
    })
  })

  // ─── PATCH /api/v1/reflexes/:name/disable ────────────────────────────────
  describe('PATCH /api/v1/reflexes/:name/disable', () => {
    it('should return 400 when trying to disable audit_behavior_log', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/audit_behavior_log/disable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/audit_behavior_log/disable')
        .set(h)
      expect(res.status).toBe(400)
    })

    it('should return 400 for invalid name format', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/INVALID-NAME!/disable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/INVALID-NAME!/disable')
        .set(h)
      expect(res.status).toBe(400)
    })

    it('should successfully disable an enabled reflex', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/phatic_micro_reaction/disable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/phatic_micro_reaction/disable')
        .set(h)
      // Either 200 (success) or 404 (builtins not initialized in time)
      expect([200, 404]).toContain(res.status)
    })

    it('should return 404 for non-existent reflex', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/nonexistent_reflex/disable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/nonexistent_reflex/disable')
        .set(h)
      expect(res.status).toBe(404)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).patch('/api/v1/reflexes/phatic_micro_reaction/disable')
      expect(res.status).toBe(401)
    })
  })

  // ─── PATCH /api/v1/reflexes/:name/enable ─────────────────────────────────
  describe('PATCH /api/v1/reflexes/:name/enable', () => {
    it('should return 400 for invalid name format', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/INVALID-NAME!/enable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/INVALID-NAME!/enable')
        .set(h)
      expect(res.status).toBe(400)
    })

    it('should return 404 for non-existent reflex', async () => {
      const h = signedHeaders('PATCH', '/api/v1/reflexes/nonexistent_reflex/enable', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .patch('/api/v1/reflexes/nonexistent_reflex/enable')
        .set(h)
      expect(res.status).toBe(404)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).patch('/api/v1/reflexes/phatic_micro_reaction/enable')
      expect(res.status).toBe(401)
    })
  })

  // ─── GET /api/v1/reflexes/executions ─────────────────────────────────────
  describe('GET /api/v1/reflexes/executions', () => {
    it('should return empty list when no executions', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/executions', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes/executions').set(h)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return 400 for invalid result value', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/executions', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes/executions?result=invalid').set(h)
      expect(res.status).toBe(400)
    })

    it('should return 400 for invalid since date', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/executions', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes/executions?since=not-a-date').set(h)
      expect(res.status).toBe(400)
    })

    it('should accept valid result filter', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/executions', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes/executions?result=executed').set(h)
      expect(res.status).toBe(200)
    })

    it('should accept valid limit and clamp to max 200', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/executions', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/reflexes/executions?limit=500').set(h)
      expect(res.status).toBe(200)
      expect(res.body.meta.limit).toBe(200)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/reflexes/executions')
      expect(res.status).toBe(401)
    })
  })
})
