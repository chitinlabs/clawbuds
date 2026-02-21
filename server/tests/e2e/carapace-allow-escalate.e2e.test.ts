/**
 * E2E Test: carapace allow/escalate/content API（Phase 11 T3）
 * POST /api/v1/carapace/allow
 * POST /api/v1/carapace/escalate
 * GET  /api/v1/carapace/content
 * 参数化运行：SQLite + Supabase
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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

describe.each(REPOSITORY_TYPES)('E2E: Carapace Allow/Escalate API [%s]', (repositoryType: RepositoryType) => {
  let tc: TestContext
  let alice: TestClaw
  let tmpCarapacePath: string

  beforeEach(async () => {
    // 创建临时 carapace.md 文件供测试使用
    const tmpDir = join(tmpdir(), `carapace-e2e-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })
    tmpCarapacePath = join(tmpDir, 'carapace.md')
    writeFileSync(tmpCarapacePath, '## 基本原则\n\n所有消息先通知我。\n', 'utf-8')

    // 必须在 createTestContext（创建 app）之前设置环境变量
    // 因为 CarapaceEditor 在 app 启动时用 CLAWBUDS_CARAPACE_PATH 初始化
    process.env['CLAWBUDS_CARAPACE_PATH'] = tmpCarapacePath
    process.env['CLAWBUDS_DATA_DIR'] = tmpDir  // 路径验证需要 DATA_DIR 包含 carapacePath

    tc = createTestContext({ repositoryType })
    alice = await registerClaw(tc.app, 'Alice')
  })

  afterEach(() => {
    destroyTestContext(tc)
    delete process.env['CLAWBUDS_CARAPACE_PATH']
    delete process.env['CLAWBUDS_DATA_DIR']
  })

  // ─── GET /api/v1/carapace/content ────────────────────────────────────────

  describe('GET /api/v1/carapace/content', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).get('/api/v1/carapace/content')
      expect(res.status).toBe(401)
    })

    it('should return current carapace.md content', async () => {
      const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.content).toContain('基本原则')
    })
  })

  // ─── POST /api/v1/carapace/allow ─────────────────────────────────────────

  describe('POST /api/v1/carapace/allow', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).post('/api/v1/carapace/allow')
        .send({ friendId: 'alice', scope: '日常消息' })
      expect(res.status).toBe(401)
    })

    it('should return 400 when friendId is missing', async () => {
      const body = { scope: '日常消息' }
      const h = signedHeaders('POST', '/api/v1/carapace/allow', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/allow').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should return 400 when scope is missing', async () => {
      const body = { friendId: 'alice' }
      const h = signedHeaders('POST', '/api/v1/carapace/allow', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/allow').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should add allow rule and return new version', async () => {
      const body = { friendId: 'bob', scope: '日常梳理消息' }
      const h = signedHeaders('POST', '/api/v1/carapace/allow', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/allow').set(h).send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.newVersion).toBe('number')
    })

    it('should not remove existing content after allow', async () => {
      const body = { friendId: 'charlie', scope: '日常消息' }
      const h = signedHeaders('POST', '/api/v1/carapace/allow', alice.clawId, alice.keys.privateKey, body)
      await request(tc.app).post('/api/v1/carapace/allow').set(h).send(body)

      const h2 = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
      const res = await request(tc.app).get('/api/v1/carapace/content').set(h2)
      expect(res.body.data.content).toContain('基本原则')  // 原有内容未被删除
      expect(res.body.data.content).toContain('charlie')   // 新规则已追加
    })
  })

  // ─── POST /api/v1/carapace/escalate ──────────────────────────────────────

  describe('POST /api/v1/carapace/escalate', () => {
    it('should return 401 without auth', async () => {
      const res = await request(tc.app).post('/api/v1/carapace/escalate')
        .send({ condition: 'test', action: 'test' })
      expect(res.status).toBe(401)
    })

    it('should return 400 when condition is missing', async () => {
      const body = { action: '需要人工确认' }
      const h = signedHeaders('POST', '/api/v1/carapace/escalate', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/escalate').set(h).send(body)
      expect(res.status).toBe(400)
    })

    it('should add escalate rule and return new version', async () => {
      const body = { condition: 'Pearl 涉及金融话题', action: '需要人工审阅' }
      const h = signedHeaders('POST', '/api/v1/carapace/escalate', alice.clawId, alice.keys.privateKey, body)
      const res = await request(tc.app).post('/api/v1/carapace/escalate').set(h).send(body)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.newVersion).toBe('number')
    })
  })
})
