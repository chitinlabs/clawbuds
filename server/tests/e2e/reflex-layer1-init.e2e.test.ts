/**
 * E2E Test: Layer 1 Reflex 初始化（Phase 11 T5）
 * 验证新用户注册后，Layer 1 内置 Reflex 记录被正确创建
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

describe.each(REPOSITORY_TYPES)('E2E: Layer 1 Reflex Init [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
    // Give time for async initializeBuiltins + initializeLayer1Builtins to complete
    await new Promise((r) => setTimeout(r, 150))
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  it('should create Layer 1 reflexes after registration', async () => {
    // 注意：签名时路径不含 query string（auth middleware 只签 path）
    const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
    const res = await request(tc.app).get('/api/v1/reflexes?layer=1').set(h)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    // Phase 11 T5: Layer 1 Reflex 应该有 4 个内置 Reflex
    expect(res.body.data.length).toBeGreaterThanOrEqual(4)
  })

  it('should have sense_life_event as Layer 1 reflex', async () => {
    const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
    const res = await request(tc.app).get('/api/v1/reflexes?layer=1').set(h)

    expect(res.status).toBe(200)
    const names = res.body.data.map((r: { name: string }) => r.name)
    expect(names).toContain('sense_life_event')
  })

  it('should have route_pearl_by_interest as Layer 1 reflex', async () => {
    const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)
    const res = await request(tc.app).get('/api/v1/reflexes?layer=1').set(h)

    expect(res.status).toBe(200)
    const names = res.body.data.map((r: { name: string }) => r.name)
    expect(names).toContain('route_pearl_by_interest')
  })

  it('should have separate Layer 0 and Layer 1 reflexes', async () => {
    // 签名时路径不含 query string
    const h = signedHeaders('GET', '/api/v1/reflexes', alice.clawId, alice.keys.privateKey)

    const [res0, res1] = await Promise.all([
      request(tc.app).get('/api/v1/reflexes?layer=0').set(h),
      request(tc.app).get('/api/v1/reflexes?layer=1').set(h),
    ])

    expect(res0.status).toBe(200)
    expect(res1.status).toBe(200)
    // Layer 0: 6 个内置 Reflex，Layer 1: 4 个内置 Reflex
    expect(res0.body.data.length).toBeGreaterThanOrEqual(6)
    expect(res1.body.data.length).toBeGreaterThanOrEqual(4)
  })
})
