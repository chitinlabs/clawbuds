/**
 * Supabase PostgreSQL Direct Connection Integration Tests
 * 通过 pg 客户端直连 Supabase 数据库（IPv6, 端口 5432）
 *
 * 环境变量:
 *   DATABASE_URL - 完整 PostgreSQL 连接字符串
 *   例: postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
 *
 * 运行: npx vitest run tests/unit/integration/supabase-direct-connection.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const { Pool } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''

// 核心业务表（Supabase 实际存在的表名）
const EXPECTED_TABLES = [
  'claws',
  'friendships',
  'messages',
  'inbox_entries',
  'circles',
  'groups',
  'group_members',  // Supabase 中为 group_members（非 group_memberships）
  'reactions',
  'pearls',
  'pearl_references',
  'pearl_endorsements',
  'pearl_shares',
]

describe('Supabase PostgreSQL 直连集成测试', () => {
  let pool: pg.Pool
  let isAvailable = false

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.log('跳过：DATABASE_URL 未配置，需要 server/.env.test.local')
      return
    }

    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    })

    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
      isAvailable = true
      console.log('直连数据库连接成功')
    } catch (err: any) {
      console.log(`跳过：直连数据库失败: ${err.message}`)
    }
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  // ---- 1. 连接性验证 ----

  describe('1. 连接性验证', () => {
    it('应能成功建立连接', () => {
      expect(isAvailable).toBe(true)
    })

    it('应能执行简单查询', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ result: number }>('SELECT 1 + 1 AS result')
      expect(rows[0].result).toBe(2)
    })

    it('应能获取当前数据库名称', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ current_database: string }>(
        'SELECT current_database()',
      )
      expect(rows[0].current_database).toBe('postgres')
    })

    it('应能获取 PostgreSQL 版本（>= 14）', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ version: string }>('SELECT version()')
      const version = rows[0].version
      expect(version).toContain('PostgreSQL')
      const majorVersion = parseInt(version.match(/PostgreSQL (\d+)/)?.[1] ?? '0')
      expect(majorVersion).toBeGreaterThanOrEqual(14)
    })
  })

  // ---- 2. Schema 验证 ----

  describe('2. Schema 结构验证', () => {
    it('应存在所有核心业务表', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
         ORDER BY tablename`,
      )

      const existingTables = rows.map((r) => r.tablename)

      for (const table of EXPECTED_TABLES) {
        expect(existingTables, `表 "${table}" 应存在`).toContain(table)
      }
    })

    it('claws 表应有正确的列结构', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'claws'
         ORDER BY ordinal_position`,
      )

      const columns = rows.map((r) => r.column_name)
      expect(columns).toContain('claw_id')
      expect(columns).toContain('public_key')
      expect(columns).toContain('display_name')
      expect(columns).toContain('created_at')
    })

    it('friendships 表应有正确的列结构', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'friendships'
         ORDER BY ordinal_position`,
      )

      const columns = rows.map((r) => r.column_name)
      expect(columns).toContain('id')
      expect(columns).toContain('requester_id')
      expect(columns).toContain('accepter_id')  // Supabase 中为 accepter_id（非 addressee_id）
      expect(columns).toContain('status')
    })

    it('messages 表应有 visibility 列和 from_claw_id 列', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'messages'
         ORDER BY ordinal_position`,
      )

      // Supabase schema: from_claw_id（非 sender_id），blocks_json（非 blocks）
      const columns = rows.map((r) => r.column_name)
      expect(columns).toContain('visibility')
      expect(columns).toContain('group_id')
      expect(columns).toContain('from_claw_id')
      expect(columns).toContain('blocks_json')
    })

    it('pearls 相关表应有正确的结构', async () => {
      if (!isAvailable) return

      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'pearls'
         ORDER BY ordinal_position`,
      )

      const columns = rows.map((r) => r.column_name)
      expect(columns).toContain('id')        // Supabase 中主键为 id（非 pearl_id）
      expect(columns).toContain('owner_id')
      expect(columns).toContain('luster')
    })
  })

  // ---- 3. CRUD 操作验证 ----

  describe('3. CRUD 直连操作验证', () => {
    const TEST_PREFIX = `test_direct_${Date.now()}`
    const testClawIds: string[] = []

    afterAll(async () => {
      if (!isAvailable || testClawIds.length === 0) return
      // 清理测试数据
      await pool.query('DELETE FROM claws WHERE claw_id = ANY($1::text[])', [testClawIds])
    })

    it('应能直接插入 claw 记录', async () => {
      if (!isAvailable) return

      const clawId = `${TEST_PREFIX}_alice`
      const publicKey = `pk_test_alice_${Date.now()}`

      await pool.query(
        `INSERT INTO claws (claw_id, public_key, display_name)
         VALUES ($1, $2, $3)`,
        [clawId, publicKey, 'Alice Direct'],
      )
      testClawIds.push(clawId)

      const { rows } = await pool.query<{ display_name: string }>(
        'SELECT display_name FROM claws WHERE claw_id = $1',
        [clawId],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].display_name).toBe('Alice Direct')
    })

    it('应能直接更新 claw 记录', async () => {
      if (!isAvailable) return

      const clawId = `${TEST_PREFIX}_bob`
      const publicKey = `pk_test_bob_${Date.now()}`

      await pool.query(
        `INSERT INTO claws (claw_id, public_key, display_name)
         VALUES ($1, $2, $3)`,
        [clawId, publicKey, 'Bob Original'],
      )
      testClawIds.push(clawId)

      await pool.query(
        'UPDATE claws SET display_name = $1 WHERE claw_id = $2',
        ['Bob Updated', clawId],
      )

      const { rows } = await pool.query<{ display_name: string }>(
        'SELECT display_name FROM claws WHERE claw_id = $1',
        [clawId],
      )
      expect(rows[0].display_name).toBe('Bob Updated')
    })

    it('应能使用参数化查询防止 SQL 注入', async () => {
      if (!isAvailable) return

      // SQL 注入攻击字符串（不应影响查询结果）
      const maliciousInput = "'; DROP TABLE claws; --"

      const { rows } = await pool.query<{ display_name: string }>(
        'SELECT display_name FROM claws WHERE display_name = $1',
        [maliciousInput],
      )
      // 没有记录匹配，表也没有被删除
      expect(rows).toHaveLength(0)

      // 验证 claws 表仍然存在
      const { rows: tableRows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM claws',
      )
      expect(parseInt(tableRows[0].count)).toBeGreaterThanOrEqual(0)
    })

    it('应能在事务中执行多步操作', async () => {
      if (!isAvailable) return

      const clawId1 = `${TEST_PREFIX}_tx1`
      const clawId2 = `${TEST_PREFIX}_tx2`

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        await client.query(
          `INSERT INTO claws (claw_id, public_key, display_name) VALUES ($1, $2, $3)`,
          [clawId1, `pk_tx1_${Date.now()}`, 'TxUser1'],
        )
        await client.query(
          `INSERT INTO claws (claw_id, public_key, display_name) VALUES ($1, $2, $3)`,
          [clawId2, `pk_tx2_${Date.now()}`, 'TxUser2'],
        )

        await client.query('COMMIT')
        testClawIds.push(clawId1, clawId2)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM claws WHERE claw_id = ANY($1::text[])',
        [[clawId1, clawId2]],
      )
      expect(parseInt(rows[0].count)).toBe(2)
    })

    it('事务回滚后数据不应持久化', async () => {
      if (!isAvailable) return

      const clawId = `${TEST_PREFIX}_rollback`

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO claws (claw_id, public_key, display_name) VALUES ($1, $2, $3)`,
          [clawId, `pk_rollback_${Date.now()}`, 'RollbackUser'],
        )
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM claws WHERE claw_id = $1',
        [clawId],
      )
      expect(parseInt(rows[0].count)).toBe(0)
    })
  })

  // ---- 4. 连接池验证 ----

  describe('4. 连接池并发验证', () => {
    it('应能并发执行多个查询', async () => {
      if (!isAvailable) return

      // 并发 5 个查询
      const queries = Array.from({ length: 5 }, (_, i) =>
        pool.query<{ n: number }>('SELECT $1::int AS n', [i]),
      )

      const results = await Promise.all(queries)
      results.forEach((r, i) => {
        expect(r.rows[0].n).toBe(i)
      })
    })
  })
})
