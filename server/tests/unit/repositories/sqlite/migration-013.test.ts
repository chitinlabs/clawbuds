/**
 * Migration 013: reflexes + reflex_executions 两张表
 * 验证迁移后表结构、字段、索引、约束均正确创建
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'

function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(tableName) as { name: string } | undefined
  return result !== undefined
}

function getTableColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return rows.map((r) => r.name)
}

function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
    .get(indexName) as { name: string } | undefined
  return result !== undefined
}

describe('Migration 013: reflexes and reflex_executions tables', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  // ─── reflexes 表 ─────────────────────────────────────────────────────────
  describe('reflexes table', () => {
    it('should create the reflexes table', () => {
      expect(tableExists(db, 'reflexes')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'reflexes')
      expect(columns).toContain('id')
      expect(columns).toContain('claw_id')
      expect(columns).toContain('name')
      expect(columns).toContain('value_layer')
      expect(columns).toContain('behavior')
      expect(columns).toContain('trigger_layer')
      expect(columns).toContain('trigger_config')
      expect(columns).toContain('enabled')
      expect(columns).toContain('confidence')
      expect(columns).toContain('source')
      expect(columns).toContain('created_at')
      expect(columns).toContain('updated_at')
    })

    it('should create idx_reflexes_claw_enabled index', () => {
      expect(indexExists(db, 'idx_reflexes_claw_enabled')).toBe(true)
    })

    it('should allow inserting a minimal reflex', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
          VALUES ('ref-1','claw-a','keepalive_heartbeat','infrastructure','keepalive',0,'{}')
        `).run()
      }).not.toThrow()
      const row = db.prepare(`SELECT * FROM reflexes WHERE id='ref-1'`).get() as Record<string, unknown>
      expect(row['enabled']).toBe(1)  // SQLite boolean = 1
      expect(row['confidence']).toBe(1.0)
      expect(row['source']).toBe('builtin')
    })

    it('should reject invalid value_layer', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
          VALUES ('ref-1','claw-a','test','invalid_layer','keepalive',0,'{}')
        `).run()
      }).toThrow()
    })

    it('should reject invalid behavior', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
          VALUES ('ref-1','claw-a','test','infrastructure','invalid_behavior',0,'{}')
        `).run()
      }).toThrow()
    })

    it('should reject invalid trigger_layer (not 0 or 1)', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
          VALUES ('ref-1','claw-a','test','infrastructure','keepalive',2,'{}')
        `).run()
      }).toThrow()
    })

    it('should enforce UNIQUE(claw_id, name)', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(`
        INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
        VALUES ('ref-1','claw-a','keepalive_heartbeat','infrastructure','keepalive',0,'{}')
      `).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
          VALUES ('ref-2','claw-a','keepalive_heartbeat','infrastructure','keepalive',0,'{}')
        `).run()
      }).toThrow()
    })

    it('should cascade delete when claw is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(`
        INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
        VALUES ('ref-1','claw-a','keepalive_heartbeat','infrastructure','keepalive',0,'{}')
      `).run()
      db.prepare(`DELETE FROM claws WHERE claw_id='claw-a'`).run()
      const row = db.prepare(`SELECT * FROM reflexes WHERE id='ref-1'`).get()
      expect(row).toBeUndefined()
    })
  })

  // ─── reflex_executions 表 ────────────────────────────────────────────────
  describe('reflex_executions table', () => {
    it('should create the reflex_executions table', () => {
      expect(tableExists(db, 'reflex_executions')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'reflex_executions')
      expect(columns).toContain('id')
      expect(columns).toContain('reflex_id')
      expect(columns).toContain('claw_id')
      expect(columns).toContain('event_type')
      expect(columns).toContain('trigger_data')
      expect(columns).toContain('execution_result')
      expect(columns).toContain('details')
      expect(columns).toContain('created_at')
    })

    it('should create idx_reflex_executions_claw index', () => {
      expect(indexExists(db, 'idx_reflex_executions_claw')).toBe(true)
    })

    it('should create idx_reflex_executions_reflex index', () => {
      expect(indexExists(db, 'idx_reflex_executions_reflex')).toBe(true)
    })

    it('should create idx_reflex_executions_result index', () => {
      expect(indexExists(db, 'idx_reflex_executions_result')).toBe(true)
    })

    it('should reject invalid execution_result', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(`
        INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
        VALUES ('ref-1','claw-a','test','infrastructure','keepalive',0,'{}')
      `).run()
      expect(() => {
        db.prepare(`
          INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
          VALUES ('exec-1','ref-1','claw-a','message.new','invalid_result')
        `).run()
      }).toThrow()
    })

    it('should cascade delete when reflex is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(`
        INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
        VALUES ('ref-1','claw-a','test','infrastructure','keepalive',0,'{}')
      `).run()
      db.prepare(`
        INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
        VALUES ('exec-1','ref-1','claw-a','message.new','executed')
      `).run()
      db.prepare(`DELETE FROM reflexes WHERE id='ref-1'`).run()
      const row = db.prepare(`SELECT * FROM reflex_executions WHERE id='exec-1'`).get()
      expect(row).toBeUndefined()
    })

    it('should allow all valid execution_result values', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(`
        INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
        VALUES ('ref-1','claw-a','test','infrastructure','keepalive',0,'{}')
      `).run()
      for (const result of ['executed', 'recommended', 'blocked', 'queued_for_l1']) {
        expect(() => {
          db.prepare(`
            INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
            VALUES ('exec-${result}','ref-1','claw-a','test','${result}')
          `).run()
        }).not.toThrow()
      }
    })
  })
})
