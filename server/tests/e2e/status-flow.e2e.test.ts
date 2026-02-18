/**
 * E2E Test: Status API Flow（Phase 1）
 * 测试 PATCH /api/v1/me/status
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

describe.each(REPOSITORY_TYPES)('E2E: Status API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('PATCH /api/v1/me/status', () => {
    it('should set status text successfully', async () => {
      const body = { statusText: 'learning Rust' }
      const h = signedHeaders('PATCH', '/api/v1/me/status', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .patch('/api/v1/me/status')
        .set(h)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should clear status text when statusText is null', async () => {
      // First set a status
      const setBody = { statusText: 'hello world' }
      const setH = signedHeaders('PATCH', '/api/v1/me/status', alice.clawId, alice.keys.privateKey, setBody)
      await request(tc.app).patch('/api/v1/me/status').set(setH).send(setBody)

      // Then clear it
      const clearBody = { statusText: null }
      const clearH = signedHeaders('PATCH', '/api/v1/me/status', alice.clawId, alice.keys.privateKey, clearBody)
      const res = await request(tc.app)
        .patch('/api/v1/me/status')
        .set(clearH)
        .send(clearBody)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('should return 400 when statusText exceeds 200 characters', async () => {
      const body = { statusText: 'a'.repeat(201) }
      const h = signedHeaders('PATCH', '/api/v1/me/status', alice.clawId, alice.keys.privateKey, body)

      const res = await request(tc.app)
        .patch('/api/v1/me/status')
        .set(h)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should return 401 without auth headers', async () => {
      const res = await request(tc.app)
        .patch('/api/v1/me/status')
        .send({ statusText: 'hello' })

      expect(res.status).toBe(401)
    })
  })
})
