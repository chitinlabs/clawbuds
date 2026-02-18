/**
 * Migration 011: friend_models 表
 * 验证迁移后表结构、字段、索引均正确创建
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'

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

describe('Migration 011: friend_models table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  describe('friend_models table', () => {
    it('should create the friend_models table', () => {
      expect(tableExists(db, 'friend_models')).toBe(true)
    })

    it('should have all Layer 0 columns', () => {
      const columns = getTableColumns(db, 'friend_models')
      expect(columns).toContain('claw_id')
      expect(columns).toContain('friend_id')
      expect(columns).toContain('last_known_state')
      expect(columns).toContain('inferred_interests')
      expect(columns).toContain('expertise_tags')
      expect(columns).toContain('last_heartbeat_at')
      expect(columns).toContain('last_interaction_at')
      expect(columns).toContain('updated_at')
    })

    it('should have all Layer 1 columns (null in Phase 2)', () => {
      const columns = getTableColumns(db, 'friend_models')
      expect(columns).toContain('inferred_needs')
      expect(columns).toContain('emotional_tone')
      expect(columns).toContain('knowledge_gaps')
    })

    it('should create idx_friend_models_claw index', () => {
      expect(indexExists(db, 'idx_friend_models_claw')).toBe(true)
    })

    it('should have inferred_interests default to empty JSON array', () => {
      const colInfo = db
        .prepare(`PRAGMA table_info(friend_models)`)
        .all() as { name: string; dflt_value: string | null }[]
      const col = colInfo.find((c) => c.name === 'inferred_interests')
      expect(col).toBeDefined()
      expect(col!.dflt_value).toBe("'[]'")
    })

    it('should have expertise_tags default to empty JSON object', () => {
      const colInfo = db
        .prepare(`PRAGMA table_info(friend_models)`)
        .all() as { name: string; dflt_value: string | null }[]
      const col = colInfo.find((c) => c.name === 'expertise_tags')
      expect(col).toBeDefined()
      expect(col!.dflt_value).toBe("'{}'")
    })

    it('should allow inserting a friend model record', () => {
      // 插入所需的 claws 记录
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'), ('claw-b','pk-b','B')`
      ).run()

      expect(() => {
        db.prepare(
          `INSERT INTO friend_models (claw_id, friend_id) VALUES ('claw-a', 'claw-b')`
        ).run()
      }).not.toThrow()

      const row = db
        .prepare(`SELECT * FROM friend_models WHERE claw_id='claw-a' AND friend_id='claw-b'`)
        .get() as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row['inferred_interests']).toBe('[]')
      expect(row['expertise_tags']).toBe('{}')
    })

    it('should enforce PRIMARY KEY constraint (no duplicate claw_id + friend_id)', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'), ('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO friend_models (claw_id, friend_id) VALUES ('claw-a', 'claw-b')`
      ).run()

      expect(() => {
        db.prepare(
          `INSERT INTO friend_models (claw_id, friend_id) VALUES ('claw-a', 'claw-b')`
        ).run()
      }).toThrow()
    })

    it('should cascade delete when claw is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'), ('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO friend_models (claw_id, friend_id) VALUES ('claw-a', 'claw-b')`
      ).run()

      // SQLite 需要先开启外键约束
      db.prepare(`PRAGMA foreign_keys = ON`).run()
      db.prepare(`DELETE FROM claws WHERE claw_id='claw-a'`).run()

      const row = db
        .prepare(`SELECT * FROM friend_models WHERE claw_id='claw-a'`)
        .get()
      expect(row).toBeUndefined()
    })
  })
})
