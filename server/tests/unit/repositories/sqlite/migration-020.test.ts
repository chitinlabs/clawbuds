/**
 * Migration 020: carapace_history 表（Phase 10）
 * 版本控制：记录每次 carapace.md 修改前的旧版本快照
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'

function setupTestClaw(db: Database.Database): void {
  db.prepare(`INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','TestClaw')`).run()
}

describe('Migration 020: carapace_history table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
    setupTestClaw(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should create carapace_history table', () => {
    expect(() => {
      db.prepare(`SELECT * FROM carapace_history LIMIT 1`).all()
    }).not.toThrow()
  })

  it('should insert a record with all required fields', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
        VALUES ('hist-1', 'claw-a', 1, '## carapace\n内容', 'manual_edit', 'user')
      `).run()
    }).not.toThrow()
  })

  it('should enforce change_reason CHECK constraint', () => {
    const validReasons = ['micro_molt', 'manual_edit', 'allow', 'escalate', 'restore']
    for (const reason of validReasons) {
      expect(() => {
        db.prepare(`
          INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
          VALUES ('hist-${reason}', 'claw-a', ${validReasons.indexOf(reason) + 1}, 'content', '${reason}', 'user')
        `).run()
      }).not.toThrow()
    }
  })

  it('should reject invalid change_reason', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
        VALUES ('hist-bad', 'claw-a', 100, 'content', 'invalid_reason', 'user')
      `).run()
    }).toThrow()
  })

  it('should enforce suggested_by CHECK constraint with valid values', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
      VALUES ('hist-sys', 'claw-a', 10, 'content', 'micro_molt', 'system')
    `).run()
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
      VALUES ('hist-usr', 'claw-a', 11, 'content', 'manual_edit', 'user')
    `).run()
    const rows = db.prepare(`SELECT COUNT(*) as cnt FROM carapace_history`).get() as { cnt: number }
    expect(rows.cnt).toBe(2)
  })

  it('should reject invalid suggested_by', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
        VALUES ('hist-bad2', 'claw-a', 200, 'content', 'manual_edit', 'invalid_actor')
      `).run()
    }).toThrow()
  })

  it('should enforce UNIQUE constraint on (claw_id, version)', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
      VALUES ('hist-dup1', 'claw-a', 5, 'content v5', 'manual_edit', 'user')
    `).run()
    expect(() => {
      db.prepare(`
        INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
        VALUES ('hist-dup2', 'claw-a', 5, 'content v5 duplicate', 'manual_edit', 'user')
      `).run()
    }).toThrow()
  })

  it('should cascade delete when claw is deleted', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
      VALUES ('hist-cascade', 'claw-a', 1, 'content', 'manual_edit', 'user')
    `).run()
    db.prepare(`DELETE FROM claws WHERE claw_id = 'claw-a'`).run()
    const rows = db.prepare(`SELECT COUNT(*) as cnt FROM carapace_history WHERE claw_id = 'claw-a'`).get() as { cnt: number }
    expect(rows.cnt).toBe(0)
  })

  it('should default created_at to current datetime', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by)
      VALUES ('hist-ts', 'claw-a', 1, 'content', 'manual_edit', 'user')
    `).run()
    const row = db.prepare(`SELECT created_at FROM carapace_history WHERE id = 'hist-ts'`).get() as { created_at: string }
    expect(row.created_at).toBeTruthy()
    expect(typeof row.created_at).toBe('string')
  })

  it('should default change_reason to manual_edit', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, suggested_by)
      VALUES ('hist-default', 'claw-a', 1, 'content', 'user')
    `).run()
    const row = db.prepare(`SELECT change_reason FROM carapace_history WHERE id = 'hist-default'`).get() as { change_reason: string }
    expect(row.change_reason).toBe('manual_edit')
  })

  it('should default suggested_by to user', () => {
    db.prepare(`
      INSERT INTO carapace_history (id, claw_id, version, content, change_reason)
      VALUES ('hist-default2', 'claw-a', 1, 'content', 'manual_edit')
    `).run()
    const row = db.prepare(`SELECT suggested_by FROM carapace_history WHERE id = 'hist-default2'`).get() as { suggested_by: string }
    expect(row.suggested_by).toBe('user')
  })
})
