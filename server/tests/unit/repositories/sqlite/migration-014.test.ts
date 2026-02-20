/**
 * Migration 014: imprints 表
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

describe('Migration 014: imprints table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  it('should create the imprints table', () => {
    expect(tableExists(db, 'imprints')).toBe(true)
  })

  it('should have all required columns', () => {
    const columns = getTableColumns(db, 'imprints')
    expect(columns).toContain('id')
    expect(columns).toContain('claw_id')
    expect(columns).toContain('friend_id')
    expect(columns).toContain('event_type')
    expect(columns).toContain('summary')
    expect(columns).toContain('source_heartbeat_id')
    expect(columns).toContain('detected_at')
  })

  it('should create idx_imprints_claw_friend index', () => {
    expect(indexExists(db, 'idx_imprints_claw_friend')).toBe(true)
  })

  it('should create idx_imprints_detected_at index', () => {
    expect(indexExists(db, 'idx_imprints_detected_at')).toBe(true)
  })

  it('should allow inserting a valid imprint', () => {
    db.prepare(
      `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
    ).run()
    expect(() => {
      db.prepare(`
        INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, detected_at)
        VALUES ('imp_abc1234567', 'claw-a', 'friend-1', 'new_job', 'Alice got a new job offer', datetime('now'))
      `).run()
    }).not.toThrow()
  })

  it('should reject invalid event_type', () => {
    db.prepare(
      `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
    ).run()
    expect(() => {
      db.prepare(`
        INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, detected_at)
        VALUES ('imp_abc1234567', 'claw-a', 'friend-1', 'invalid_type', 'test', datetime('now'))
      `).run()
    }).toThrow()
  })

  it('should accept all valid event_type values', () => {
    db.prepare(
      `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
    ).run()
    const validTypes = ['new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other']
    for (const type of validTypes) {
      expect(() => {
        db.prepare(`
          INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, detected_at)
          VALUES ('imp_${type.slice(0, 10)}', 'claw-a', 'friend-1', '${type}', 'test summary', datetime('now'))
        `).run()
      }).not.toThrow()
    }
  })

  it('should allow null source_heartbeat_id', () => {
    db.prepare(
      `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
    ).run()
    expect(() => {
      db.prepare(`
        INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, detected_at)
        VALUES ('imp_nulltest01', 'claw-a', 'friend-1', 'other', 'summary', datetime('now'))
      `).run()
    }).not.toThrow()
    const row = db.prepare(`SELECT source_heartbeat_id FROM imprints WHERE id='imp_nulltest01'`).get() as Record<string, unknown>
    expect(row['source_heartbeat_id']).toBeNull()
  })

  it('should reject summary longer than 200 chars', () => {
    db.prepare(
      `INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`
    ).run()
    const longSummary = 'x'.repeat(201)
    expect(() => {
      db.prepare(`
        INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, detected_at)
        VALUES ('imp_longsum01', 'claw-a', 'friend-1', 'other', '${longSummary}', datetime('now'))
      `).run()
    }).toThrow()
  })
})
