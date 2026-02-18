/**
 * E2E Test: Relationships API Flow（Phase 1）
 * 测试 GET /api/v1/relationships 和 GET /api/v1/relationships/at-risk
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

describe.each(REPOSITORY_TYPES)('E2E: Relationships API [%s]', (repositoryType: RepositoryType) => {
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
  // GET /api/v1/relationships
  // ─────────────────────────────────────────────
  describe('GET /api/v1/relationships', () => {
    it('should return empty layers when no relationship strength records', async () => {
      const h = signedHeaders('GET', '/api/v1/relationships', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app).get('/api/v1/relationships').set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('core')
      expect(res.body.data).toHaveProperty('sympathy')
      expect(res.body.data).toHaveProperty('active')
      expect(res.body.data).toHaveProperty('casual')
    })

    it('should filter by layer query parameter', async () => {
      const h = signedHeaders('GET', '/api/v1/relationships', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app).get('/api/v1/relationships?layer=core').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('core')
      // When filtering, only the requested layer should be present
      expect(Object.keys(res.body.data)).toEqual(['core'])
    })

    it('should return 401 without auth headers', async () => {
      const res = await request(tc.app).get('/api/v1/relationships')
      expect(res.status).toBe(401)
    })

    it('should return 400 for invalid layer parameter', async () => {
      const h = signedHeaders('GET', '/api/v1/relationships', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app).get('/api/v1/relationships?layer=invalid').set(h)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ─────────────────────────────────────────────
  // GET /api/v1/relationships/at-risk
  // ─────────────────────────────────────────────
  describe('GET /api/v1/relationships/at-risk', () => {
    it('should return empty list when no at-risk relationships', async () => {
      const h = signedHeaders('GET', '/api/v1/relationships/at-risk', alice.clawId, alice.keys.privateKey)

      const res = await request(tc.app).get('/api/v1/relationships/at-risk').set(h)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('should return 401 without auth headers', async () => {
      const res = await request(tc.app).get('/api/v1/relationships/at-risk')
      expect(res.status).toBe(401)
    })
  })
})
