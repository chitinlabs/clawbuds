/**
 * E2E Test: carapace allow/escalate/content API（Phase 12b 更新）
 *
 * Phase 12b 变更：
 * - POST /api/v1/carapace/allow    已删除（返回 404）
 * - POST /api/v1/carapace/escalate 已删除（返回 404）
 * - GET  /api/v1/carapace/content  改为读 DB 最新快照（不再依赖 CLAWBUDS_CARAPACE_PATH）
 *
 * allow/escalate 操作已移至客户端（skill commands），客户端直接操作本地文件并推送快照。
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

describe.each(REPOSITORY_TYPES)('E2E: Carapace Phase 12b API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw

  beforeEach(async () => {
    // Phase 12b: 不再需要 CLAWBUDS_CARAPACE_PATH 或 CLAWBUDS_DATA_DIR
    delete process.env['CLAWBUDS_CARAPACE_PATH']
    delete process.env['CLAWBUDS_DATA_DIR']
    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  // ─── GET /api/v1/carapace/content（Phase 12b: 读 DB 快照）────────────────

  describe('GET /api/v1/carapace/content', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/carapace/content')
      expect(res.status).toBe(401)
    })

    it('should return empty string when no snapshot has been pushed', async () => {
      const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.content).toBe('')
    })

    it('should return snapshot content after client pushes snapshot', async () => {
      // 客户端推送快照（Phase 12b 流程：客户端修改本地文件后调用此端点）
      const content = '## 基本原则\n\n所有消息先通知我。\n'
      const snapBody = { content, reason: 'manual' }
      const snapH = signedHeaders('POST', '/api/v1/carapace/snapshot', alice.clawId, alice.keys.privateKey, snapBody)
      await request(tc.app).post('/api/v1/carapace/snapshot').set(snapH).send(snapBody)

      const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
      expect(res.status).toBe(200)
      expect(res.body.data.content).toContain('基本原则')
    })
  })

  // ─── POST /api/v1/carapace/allow（Phase 12b: 已删除）────────────────────

  describe('POST /api/v1/carapace/allow (deleted in Phase 12b)', () => {
    it('should return 404 (endpoint removed)', async () => {
      const body = { friendId: 'bob', scope: '日常梳理消息' }
      const h = signedHeaders('POST', '/api/v1/carapace/allow', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/allow').set(h).send(body)
      expect(res.status).toBe(404)
    })
  })

  // ─── POST /api/v1/carapace/escalate（Phase 12b: 已删除）─────────────────

  describe('POST /api/v1/carapace/escalate (deleted in Phase 12b)', () => {
    it('should return 404 (endpoint removed)', async () => {
      const body = { condition: 'Pearl 涉及金融话题', action: '需要人工审阅' }
      const h = signedHeaders('POST', '/api/v1/carapace/escalate', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/escalate').set(h).send(body)
      expect(res.status).toBe(404)
    })
  })
})
