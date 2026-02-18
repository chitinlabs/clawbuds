/**
 * Migration 010: heartbeats + relationship_strength + claws.status_text
 * 验证迁移后表结构、字段、索引均正确创建
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTestDatabase } from '../../../../src/db/database.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 辅助函数：检查指定表是否存在
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(tableName) as { name: string } | undefined
  return result !== undefined
}

/**
 * 辅助函数：获取表的所有列名
 */
function getTableColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return rows.map((r) => r.name)
}

/**
 * 辅助函数：检查索引是否存在
 */
function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
    .get(indexName) as { name: string } | undefined
  return result !== undefined
}

describe('Migration 010: heartbeat + relationship_strength tables', () => {
  let db: Database.Database

  beforeEach(() => {
    // createTestDatabase() 会自动运行所有迁移，包括 010
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  // ─────────────────────────────────────────────
  // heartbeats 表
  // ─────────────────────────────────────────────
  describe('heartbeats table', () => {
    it('should create the heartbeats table', () => {
      expect(tableExists(db, 'heartbeats')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'heartbeats')
      expect(columns).toContain('id')
      expect(columns).toContain('from_claw_id')
      expect(columns).toContain('to_claw_id')
      expect(columns).toContain('interests')
      expect(columns).toContain('availability')
      expect(columns).toContain('recent_topics')
      expect(columns).toContain('is_keepalive')
      expect(columns).toContain('created_at')
    })

    it('should create idx_heartbeats_to_claw index', () => {
      expect(indexExists(db, 'idx_heartbeats_to_claw')).toBe(true)
    })

    it('should create idx_heartbeats_from_to index', () => {
      expect(indexExists(db, 'idx_heartbeats_from_to')).toBe(true)
    })

    it('should set is_keepalive default to FALSE (0)', () => {
      const colInfo = db
        .prepare(`PRAGMA table_info(heartbeats)`)
        .all() as { name: string; dflt_value: string | null }[]
      const keepaliveCol = colInfo.find((c) => c.name === 'is_keepalive')
      expect(keepaliveCol).toBeDefined()
      // SQLite 存储 FALSE 为 0
      expect(keepaliveCol!.dflt_value).toBe('0')
    })
  })

  // ─────────────────────────────────────────────
  // relationship_strength 表
  // ─────────────────────────────────────────────
  describe('relationship_strength table', () => {
    it('should create the relationship_strength table', () => {
      expect(tableExists(db, 'relationship_strength')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'relationship_strength')
      expect(columns).toContain('claw_id')
      expect(columns).toContain('friend_id')
      expect(columns).toContain('strength')
      expect(columns).toContain('dunbar_layer')
      expect(columns).toContain('manual_override')
      expect(columns).toContain('last_interaction_at')
      expect(columns).toContain('updated_at')
    })

    it('should create idx_rs_claw_strength index', () => {
      expect(indexExists(db, 'idx_rs_claw_strength')).toBe(true)
    })

    it('should create idx_rs_claw_layer index', () => {
      expect(indexExists(db, 'idx_rs_claw_layer')).toBe(true)
    })

    it('should have strength default of 0.5', () => {
      const colInfo = db
        .prepare(`PRAGMA table_info(relationship_strength)`)
        .all() as { name: string; dflt_value: string | null }[]
      const strengthCol = colInfo.find((c) => c.name === 'strength')
      expect(strengthCol!.dflt_value).toBe('0.5')
    })

    it('should have dunbar_layer default of casual', () => {
      const colInfo = db
        .prepare(`PRAGMA table_info(relationship_strength)`)
        .all() as { name: string; dflt_value: string | null }[]
      const layerCol = colInfo.find((c) => c.name === 'dunbar_layer')
      expect(layerCol!.dflt_value).toBe("'casual'")
    })

    it('should enforce dunbar_layer CHECK constraint', () => {
      // 先往 claws 表插入测试数据满足外键约束
      db.prepare(`INSERT INTO claws (claw_id, public_key, display_name) VALUES ('a','pk-a','A'), ('b','pk-b','B')`).run()

      // 有效值不应报错
      expect(() => {
        db.prepare(`INSERT INTO relationship_strength (claw_id, friend_id, dunbar_layer) VALUES ('a','b','core')`).run()
      }).not.toThrow()

      db.prepare(`DELETE FROM relationship_strength`).run()

      // 无效值应报错
      expect(() => {
        db.prepare(`INSERT INTO relationship_strength (claw_id, friend_id, dunbar_layer) VALUES ('a','b','invalid_layer')`).run()
      }).toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // claws.status_text 字段
  // ─────────────────────────────────────────────
  describe('claws.status_text column', () => {
    it('should add status_text column to claws table', () => {
      const columns = getTableColumns(db, 'claws')
      expect(columns).toContain('status_text')
    })

    it('should allow null status_text', () => {
      const row = db
        .prepare(`SELECT status_text FROM claws LIMIT 1`)
        .get() as { status_text: string | null } | undefined
      // 表可能为空，只需要 PRAGMA 能查到该字段
      const colInfo = db
        .prepare(`PRAGMA table_info(claws)`)
        .all() as { name: string; notnull: number }[]
      const statusCol = colInfo.find((c) => c.name === 'status_text')
      expect(statusCol).toBeDefined()
      expect(statusCol!.notnull).toBe(0) // nullable
    })
  })
})
