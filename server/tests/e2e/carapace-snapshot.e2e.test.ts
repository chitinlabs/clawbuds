/**
 * E2E Test: carapace snapshot API（Phase 12b）
 * POST /api/v1/carapace/snapshot — 客户端推送最新快照
 * GET  /api/v1/carapace/content  — 读取 DB 最新快照（不再依赖 CLAWBUDS_CARAPACE_PATH）
 * POST /api/v1/carapace/restore/:version — 返回内容，不写文件
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

describe.each(REPOSITORY_TYPES)(
  'E2E: Carapace Snapshot API [%s]',
  (repositoryType: RepositoryType) => {
    let tc: TestContext
    let alice: TestClaw

    beforeEach(async () => {
      // Phase 12b: 不再需要 CLAWBUDS_CARAPACE_PATH
      delete process.env['CLAWBUDS_CARAPACE_PATH']
      delete process.env['CLAWBUDS_DATA_DIR']
      tc = createTestContext({ repositoryType })
      alice = await registerClaw(tc.app, 'Alice')
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    // ─── POST /api/v1/carapace/snapshot ─────────────────────────────────────

    describe('POST /api/v1/carapace/snapshot', () => {
      it('should return 401 without auth', async () => {
        const res = await request(tc.app)
          .post('/api/v1/carapace/snapshot')
          .send({ content: 'test', reason: 'manual' })
        expect(res.status).toBe(401)
      })

      it('should return 400 when content is missing', async () => {
        const body = { reason: 'manual' }
        const h = signedHeaders(
          'POST',
          '/api/v1/carapace/snapshot',
          alice.clawId,
          alice.keys.privateKey,
          body,
        )
        const res = await request(tc.app).post('/api/v1/carapace/snapshot').set(h).send(body)
        expect(res.status).toBe(400)
      })

      it('should store snapshot and return version', async () => {
        const body = { content: '## 原则\n\n先通知后执行。', reason: 'manual' }
        const h = signedHeaders(
          'POST',
          '/api/v1/carapace/snapshot',
          alice.clawId,
          alice.keys.privateKey,
          body,
        )
        const res = await request(tc.app).post('/api/v1/carapace/snapshot').set(h).send(body)
        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(typeof res.body.data.version).toBe('number')
        expect(res.body.data.version).toBeGreaterThan(0)
      })

      it('should accept all valid reasons', async () => {
        const reasons = ['allow', 'escalate', 'restore', 'manual']
        for (const reason of reasons) {
          const body = { content: `test content for ${reason}`, reason }
          const h = signedHeaders(
            'POST',
            '/api/v1/carapace/snapshot',
            alice.clawId,
            alice.keys.privateKey,
            body,
          )
          const res = await request(tc.app).post('/api/v1/carapace/snapshot').set(h).send(body)
          expect(res.status).toBe(200)
        }
      })
    })

    // ─── GET /api/v1/carapace/content ────────────────────────────────────────

    describe('GET /api/v1/carapace/content', () => {
      it('should return 401 without auth', async () => {
        const res = await request(tc.app).get('/api/v1/carapace/content')
        expect(res.status).toBe(401)
      })

      it('should return empty string when no snapshot exists', async () => {
        const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
        const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.content).toBe('')
      })

      it('should return latest snapshot content after push', async () => {
        const content = '## 规则\n\n允许 Alice 直接发送消息。'
        const snapBody = { content, reason: 'allow' }
        const snapH = signedHeaders(
          'POST',
          '/api/v1/carapace/snapshot',
          alice.clawId,
          alice.keys.privateKey,
          snapBody,
        )
        await request(tc.app).post('/api/v1/carapace/snapshot').set(snapH).send(snapBody)

        const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
        const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
        expect(res.status).toBe(200)
        expect(res.body.data.content).toBe(content)
      })

      it('should work without CLAWBUDS_CARAPACE_PATH env var', async () => {
        // Server should function normally without this env var (Phase 12b)
        expect(process.env['CLAWBUDS_CARAPACE_PATH']).toBeUndefined()
        const h = signedHeaders('GET', '/api/v1/carapace/content', alice.clawId, alice.keys.privateKey)
        const res = await request(tc.app).get('/api/v1/carapace/content').set(h)
        expect(res.status).toBe(200)
      })
    })

    // ─── POST /api/v1/carapace/restore/:version ──────────────────────────────

    describe('POST /api/v1/carapace/restore/:version', () => {
      it('should return content without writing to file', async () => {
        // 先推送两个快照
        const v1Content = '版本一内容'
        const v2Content = '版本二内容'

        for (const [content, reason] of [[v1Content, 'manual'], [v2Content, 'manual']]) {
          const body = { content, reason }
          const h = signedHeaders(
            'POST',
            '/api/v1/carapace/snapshot',
            alice.clawId,
            alice.keys.privateKey,
            body,
          )
          await request(tc.app).post('/api/v1/carapace/snapshot').set(h).send(body)
        }

        // restore 版本 1 — 应返回内容而不写文件
        const h = signedHeaders(
          'POST',
          '/api/v1/carapace/restore/1',
          alice.clawId,
          alice.keys.privateKey,
        )
        const res = await request(tc.app).post('/api/v1/carapace/restore/1').set(h)
        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.content).toBe(v1Content)
        expect(res.body.data.version).toBe(1)
      })
    })
  },
)
