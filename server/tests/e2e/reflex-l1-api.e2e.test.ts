/**
 * E2E Test: Reflex Layer 1 API（Phase 5）
 * POST /api/v1/reflexes/ack, GET /api/v1/reflexes/pending-l1
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

describe.each(REPOSITORY_TYPES)('E2E: Reflex L1 API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    await new Promise((r) => setTimeout(r, 50))
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('POST /api/v1/reflexes/ack', () => {
    it('should return 404 for non-existent batchId', async () => {
      const body = { batchId: 'batch_nonexistent01' }
      const h = signedHeaders('POST', '/api/v1/reflexes/ack', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/reflexes/ack')
        .set(h)
        .send(body)
      expect(res.status).toBe(404)
    })

    it('should return 400 when batchId is missing', async () => {
      const body = {}
      const h = signedHeaders('POST', '/api/v1/reflexes/ack', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app)
        .post('/api/v1/reflexes/ack')
        .set(h)
        .send(body)
      expect(res.status).toBe(400)
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app)
        .post('/api/v1/reflexes/ack')
        .send({ batchId: 'batch_test' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/v1/reflexes/pending-l1', () => {
    it('should return queue status', async () => {
      const h = signedHeaders('GET', '/api/v1/reflexes/pending-l1', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app)
        .get('/api/v1/reflexes/pending-l1')
        .set(h)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.queueSize).toBe('number')
    })

    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/reflexes/pending-l1')
      expect(res.status).toBe(401)
    })
  })
})
