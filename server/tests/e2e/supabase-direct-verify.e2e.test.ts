/**
 * E2E Test: Supabase API + PostgreSQL 直连双重验证
 *
 * 测试策略：
 *   1. 通过 Supabase REST API（JS 客户端）创建数据
 *   2. 通过 pg 直连 PostgreSQL 验证数据真实落库
 *   3. 确保 REST API 层和 DB 层数据完全一致
 *
 * 覆盖场景：
 *   - 用户注册 → 直连验证 claws 表
 *   - 好友关系建立 → 直连验证 friendships 表
 *   - 消息发送 → 直连验证 messages 表
 *
 * 环境变量（来自 .env.test.local）：
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 *
 * 跳过条件：
 *   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置 → 跳过
 *   - DATABASE_URL 未配置 → 跳过
 *   - pg 直连认证失败（密码错误等）→ 跳过（打印警告）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import type { Express } from 'express'
import {
  createTestContext,
  destroyTestContext,
  registerClaw,
  makeFriends,
  sendDirectMessage,
  type TestContext,
  type TestClaw,
} from './helpers.js'

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  ''

const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY)
const isDirectDbConfigured = !!DATABASE_URL

describe('E2E: Supabase API + 直连 PostgreSQL 双重验证', () => {
  let pool: pg.Pool
  let tc: TestContext
  let app: Express
  let alice: TestClaw
  let bob: TestClaw

  // isReady: true 当 Supabase + 直连 pg 均可用且测试数据初始化完毕
  let isReady = false

  // 记录本次测试创建的数据，用于清理
  const createdClawIds: string[] = []
  const createdFriendshipIds: string[] = []

  beforeAll(async () => {
    if (!isSupabaseConfigured) {
      console.log('跳过：Supabase 环境变量未配置（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）')
      return
    }
    if (!isDirectDbConfigured) {
      console.log('跳过：DATABASE_URL 未配置，无法进行直连验证')
      return
    }

    // 初始化直连 pg 连接池
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
    })

    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
    } catch (err: any) {
      console.warn(
        `[direct-verify] 直连数据库失败，跳过双重验证测试: ${err.message}\n` +
          '  请检查 DATABASE_URL 中的密码是否正确（Supabase Dashboard → Settings → Database）',
      )
      await pool.end().catch(() => {})
      return
    }

    // 初始化 Supabase 应用上下文
    try {
      tc = createTestContext({ repositoryType: 'supabase' })
      app = tc.app

      // 注册测试用户
      alice = await registerClaw(app, `DirectAlice_${Date.now()}`)
      bob = await registerClaw(app, `DirectBob_${Date.now()}`)
      createdClawIds.push(alice.clawId, bob.clawId)
      isReady = true
    } catch (err: any) {
      console.warn(`[direct-verify] Supabase 初始化失败: ${err.message}`)
    }
  })

  afterAll(async () => {
    if (tc) {
      destroyTestContext(tc)
    }

    if (pool && isReady) {
      // 清理测试数据（按外键依赖顺序）
      if (createdFriendshipIds.length > 0) {
        await pool
          .query('DELETE FROM friendships WHERE id = ANY($1::text[])', [createdFriendshipIds])
          .catch(() => {})
      }
      if (createdClawIds.length > 0) {
        await pool
          .query('DELETE FROM messages WHERE sender_id = ANY($1::text[])', [createdClawIds])
          .catch(() => {})
        await pool
          .query('DELETE FROM inbox_entries WHERE recipient_id = ANY($1::text[])', [
            createdClawIds,
          ])
          .catch(() => {})
        await pool
          .query(
            'DELETE FROM friendships WHERE requester_id = ANY($1::text[]) OR addressee_id = ANY($1::text[])',
            [createdClawIds],
          )
          .catch(() => {})
        await pool
          .query('DELETE FROM claws WHERE claw_id = ANY($1::text[])', [createdClawIds])
          .catch(() => {})
      }
    }

    if (pool) {
      await pool.end().catch(() => {})
    }
  })

  // ---- 1. 用户注册验证 ----

  describe('1. 用户注册：API → 直连验证', () => {
    it('Alice 通过 API 注册后，直连应能查到 claws 记录', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{
        claw_id: string
        public_key: string
        display_name: string
      }>('SELECT claw_id, public_key, display_name FROM claws WHERE claw_id = $1', [
        alice.clawId,
      ])

      expect(rows).toHaveLength(1)
      expect(rows[0].claw_id).toBe(alice.clawId)
      expect(rows[0].public_key).toBe(alice.keys.publicKey)
      expect(rows[0].display_name).toBe(alice.displayName)
    })

    it('Bob 通过 API 注册后，直连应能查到 claws 记录', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{ claw_id: string; display_name: string }>(
        'SELECT claw_id, display_name FROM claws WHERE claw_id = $1',
        [bob.clawId],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].claw_id).toBe(bob.clawId)
    })

    it('直连 claws 计数应与 API 注册次数一致', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM claws WHERE claw_id = ANY($1::text[])',
        [createdClawIds],
      )
      expect(parseInt(rows[0].count)).toBe(createdClawIds.length)
    })
  })

  // ---- 2. 好友关系验证 ----

  describe('2. 好友关系：API 建立 → 直连验证 friendships 表', () => {
    let friendshipId: string

    beforeAll(async () => {
      if (!isReady) return
      friendshipId = await makeFriends(app, alice, bob)
      createdFriendshipIds.push(friendshipId)
    })

    it('好友关系建立后，直连应查到 accepted 状态的 friendship', async () => {
      if (!isReady || !friendshipId) return

      const { rows } = await pool.query<{
        id: string
        requester_id: string
        addressee_id: string
        status: string
      }>(
        'SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = $1',
        [friendshipId],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('accepted')
      expect([rows[0].requester_id, rows[0].addressee_id]).toContain(alice.clawId)
      expect([rows[0].requester_id, rows[0].addressee_id]).toContain(bob.clawId)
    })

    it('直连双向查询：Alice 和 Bob 互为好友', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM friendships
         WHERE status = 'accepted'
           AND (
             (requester_id = $1 AND addressee_id = $2)
             OR
             (requester_id = $2 AND addressee_id = $1)
           )`,
        [alice.clawId, bob.clawId],
      )

      expect(parseInt(rows[0].count)).toBe(1)
    })
  })

  // ---- 3. 消息发送验证 ----

  describe('3. 消息发送：API 发送 → 直连验证 messages 表', () => {
    it('Alice 发给 Bob 的消息应在 messages 表中存在', async () => {
      if (!isReady) return

      const uniqueText = `直连验证消息_${Date.now()}`
      await sendDirectMessage(app, alice, bob, uniqueText)

      const { rows } = await pool.query<{
        sender_id: string
        recipient_id: string
        visibility: string
      }>(
        `SELECT sender_id, recipient_id, visibility
         FROM messages
         WHERE sender_id = $1 AND recipient_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [alice.clawId, bob.clawId],
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].sender_id).toBe(alice.clawId)
      expect(rows[0].recipient_id).toBe(bob.clawId)
      expect(rows[0].visibility).toBe('direct')
    })

    it('消息内容（blocks）应正确存储', async () => {
      if (!isReady) return

      const markerText = `marker_${Date.now()}`
      await sendDirectMessage(app, alice, bob, markerText)

      const { rows } = await pool.query<{ blocks: unknown }>(
        `SELECT blocks FROM messages
         WHERE sender_id = $1 AND recipient_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [alice.clawId, bob.clawId],
      )

      expect(rows).toHaveLength(1)
      const blocks =
        typeof rows[0].blocks === 'string' ? JSON.parse(rows[0].blocks) : rows[0].blocks
      expect(JSON.stringify(blocks)).toContain(markerText)
    })
  })

  // ---- 4. 数据一致性验证 ----

  describe('4. REST API 与直连数据一致性', () => {
    it('直连 claws 表的 public_key 应与注册时完全一致', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{ public_key: string }>(
        'SELECT public_key FROM claws WHERE claw_id = $1',
        [alice.clawId],
      )

      expect(rows[0].public_key).toBe(alice.keys.publicKey)
    })

    it('通过直连统计 Alice 发出的消息数应大于 0', async () => {
      if (!isReady) return

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM messages WHERE sender_id = $1',
        [alice.clawId],
      )

      expect(parseInt(rows[0].count)).toBeGreaterThan(0)
    })
  })
})
