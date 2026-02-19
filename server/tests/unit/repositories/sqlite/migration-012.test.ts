/**
 * Migration 012: pearls 系统 4 张表
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

function getColumnDefault(db: Database.Database, tableName: string, colName: string): string | null {
  const colInfo = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as { name: string; dflt_value: string | null }[]
  const col = colInfo.find((c) => c.name === colName)
  return col?.dflt_value ?? null
}

describe('Migration 012: pearls system tables', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  // ─── pearls 表 ───────────────────────────────────────────────────────────
  describe('pearls table', () => {
    it('should create the pearls table', () => {
      expect(tableExists(db, 'pearls')).toBe(true)
    })

    it('should have all Level 0 (Metadata) columns', () => {
      const columns = getTableColumns(db, 'pearls')
      expect(columns).toContain('id')
      expect(columns).toContain('owner_id')
      expect(columns).toContain('type')
      expect(columns).toContain('trigger_text')
      expect(columns).toContain('domain_tags')
      expect(columns).toContain('luster')
      expect(columns).toContain('shareability')
      expect(columns).toContain('share_conditions')
      expect(columns).toContain('created_at')
      expect(columns).toContain('updated_at')
    })

    it('should have all Level 1 (Content) columns', () => {
      const columns = getTableColumns(db, 'pearls')
      expect(columns).toContain('body')
      expect(columns).toContain('context')
      expect(columns).toContain('origin_type')
    })

    it('should have luster default 0.5', () => {
      const dflt = getColumnDefault(db, 'pearls', 'luster')
      expect(dflt).toBe('0.5')
    })

    it("should have shareability default 'friends_only'", () => {
      const dflt = getColumnDefault(db, 'pearls', 'shareability')
      expect(dflt).toBe("'friends_only'")
    })

    it("should have domain_tags default '[]'", () => {
      const dflt = getColumnDefault(db, 'pearls', 'domain_tags')
      expect(dflt).toBe("'[]'")
    })

    it("should have origin_type default 'manual'", () => {
      const dflt = getColumnDefault(db, 'pearls', 'origin_type')
      expect(dflt).toBe("'manual'")
    })

    it('should create idx_pearls_owner index', () => {
      expect(indexExists(db, 'idx_pearls_owner')).toBe(true)
    })

    it('should create idx_pearls_shareability index', () => {
      expect(indexExists(db, 'idx_pearls_shareability')).toBe(true)
    })

    it('should allow inserting a minimal pearl', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()

      expect(() => {
        db.prepare(
          `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test trigger')`
        ).run()
      }).not.toThrow()

      const row = db.prepare(`SELECT * FROM pearls WHERE id='pearl-1'`).get() as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row['luster']).toBe(0.5)
      expect(row['shareability']).toBe('friends_only')
      expect(row['domain_tags']).toBe('[]')
      expect(row['origin_type']).toBe('manual')
    })

    it('should reject invalid type values', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(
          `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','invalid_type','test')`
        ).run()
      }).toThrow()
    })

    it('should reject invalid shareability values', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(
          `INSERT INTO pearls (id, owner_id, type, trigger_text, shareability) VALUES ('pearl-1','claw-a','insight','test','invalid')`
        ).run()
      }).toThrow()
    })

    it('should reject invalid origin_type values', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      expect(() => {
        db.prepare(
          `INSERT INTO pearls (id, owner_id, type, trigger_text, origin_type) VALUES ('pearl-1','claw-a','insight','test','invalid_origin')`
        ).run()
      }).toThrow()
    })

    it('should cascade delete when owner claw is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()

      db.prepare(`DELETE FROM claws WHERE claw_id='claw-a'`).run()

      const row = db.prepare(`SELECT * FROM pearls WHERE id='pearl-1'`).get()
      expect(row).toBeUndefined()
    })
  })

  // ─── pearl_references 表 ─────────────────────────────────────────────────
  describe('pearl_references table', () => {
    it('should create the pearl_references table', () => {
      expect(tableExists(db, 'pearl_references')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'pearl_references')
      expect(columns).toContain('id')
      expect(columns).toContain('pearl_id')
      expect(columns).toContain('type')
      expect(columns).toContain('content')
      expect(columns).toContain('created_at')
    })

    it('should create idx_pearl_references_pearl index', () => {
      expect(indexExists(db, 'idx_pearl_references_pearl')).toBe(true)
    })

    it('should cascade delete when pearl is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_references (id, pearl_id, type, content) VALUES ('ref-1','pearl-1','source','https://example.com')`
      ).run()

      db.prepare(`DELETE FROM pearls WHERE id='pearl-1'`).run()

      const row = db.prepare(`SELECT * FROM pearl_references WHERE id='ref-1'`).get()
      expect(row).toBeUndefined()
    })
  })

  // ─── pearl_endorsements 表 ───────────────────────────────────────────────
  describe('pearl_endorsements table', () => {
    it('should create the pearl_endorsements table', () => {
      expect(tableExists(db, 'pearl_endorsements')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'pearl_endorsements')
      expect(columns).toContain('id')
      expect(columns).toContain('pearl_id')
      expect(columns).toContain('endorser_claw_id')
      expect(columns).toContain('score')
      expect(columns).toContain('comment')
      expect(columns).toContain('created_at')
      expect(columns).toContain('updated_at')
    })

    it('should create idx_pearl_endorsements_pearl index', () => {
      expect(indexExists(db, 'idx_pearl_endorsements_pearl')).toBe(true)
    })

    it('should enforce UNIQUE(pearl_id, endorser_claw_id)', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-1','pearl-1','claw-b',0.8)`
      ).run()

      expect(() => {
        db.prepare(
          `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-2','pearl-1','claw-b',0.9)`
        ).run()
      }).toThrow()
    })

    it('should reject score above 1.0', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      expect(() => {
        db.prepare(
          `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-1','pearl-1','claw-b',1.5)`
        ).run()
      }).toThrow()
    })

    it('should reject score below 0.0', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      expect(() => {
        db.prepare(
          `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-1','pearl-1','claw-b',-0.1)`
        ).run()
      }).toThrow()
    })

    it('should cascade delete endorsements when endorser claw is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-1','pearl-1','claw-b',0.8)`
      ).run()

      db.prepare(`DELETE FROM claws WHERE claw_id='claw-b'`).run()

      const row = db.prepare(`SELECT * FROM pearl_endorsements WHERE id='end-1'`).get()
      expect(row).toBeUndefined()
    })

    it('should cascade delete when pearl is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_endorsements (id, pearl_id, endorser_claw_id, score) VALUES ('end-1','pearl-1','claw-b',0.8)`
      ).run()

      db.prepare(`DELETE FROM pearls WHERE id='pearl-1'`).run()

      const row = db.prepare(`SELECT * FROM pearl_endorsements WHERE id='end-1'`).get()
      expect(row).toBeUndefined()
    })
  })

  // ─── pearl_shares 表 ─────────────────────────────────────────────────────
  describe('pearl_shares table', () => {
    it('should create the pearl_shares table', () => {
      expect(tableExists(db, 'pearl_shares')).toBe(true)
    })

    it('should have all required columns', () => {
      const columns = getTableColumns(db, 'pearl_shares')
      expect(columns).toContain('id')
      expect(columns).toContain('pearl_id')
      expect(columns).toContain('from_claw_id')
      expect(columns).toContain('to_claw_id')
      expect(columns).toContain('created_at')
    })

    it('should create idx_pearl_shares_to index', () => {
      expect(indexExists(db, 'idx_pearl_shares_to')).toBe(true)
    })

    it('should create idx_pearl_shares_from index', () => {
      expect(indexExists(db, 'idx_pearl_shares_from')).toBe(true)
    })

    it('should enforce UNIQUE(pearl_id, from_claw_id, to_claw_id)', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_shares (id, pearl_id, from_claw_id, to_claw_id) VALUES ('share-1','pearl-1','claw-a','claw-b')`
      ).run()

      expect(() => {
        db.prepare(
          `INSERT INTO pearl_shares (id, pearl_id, from_claw_id, to_claw_id) VALUES ('share-2','pearl-1','claw-a','claw-b')`
        ).run()
      }).toThrow()
    })

    it('should cascade delete when pearl is deleted', () => {
      db.prepare(
        `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A'),('claw-b','pk-b','B')`
      ).run()
      db.prepare(
        `INSERT INTO pearls (id, owner_id, type, trigger_text) VALUES ('pearl-1','claw-a','insight','test')`
      ).run()
      db.prepare(
        `INSERT INTO pearl_shares (id, pearl_id, from_claw_id, to_claw_id) VALUES ('share-1','pearl-1','claw-a','claw-b')`
      ).run()

      db.prepare(`DELETE FROM pearls WHERE id='pearl-1'`).run()

      const row = db.prepare(`SELECT * FROM pearl_shares WHERE id='share-1'`).get()
      expect(row).toBeUndefined()
    })
  })
})
