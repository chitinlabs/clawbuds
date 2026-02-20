/**
 * Migration 016: briefings 表结构验证（Phase 6）
 * TDD 红灯：migration 尚未创建时这些测试应失败
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'

describe('Migration 016: briefings 表', () => {
  let db: Database.Database
  let clawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    const clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-brief-test', displayName: 'BriefTester' })
    clawId = claw.clawId
  })

  afterEach(() => db.close())

  it('should create briefings table', () => {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='briefings'"
    ).get()
    expect(result).toBeTruthy()
  })

  it('should have correct columns', () => {
    const cols = db.prepare("PRAGMA table_info(briefings)").all() as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('claw_id')
    expect(colNames).toContain('type')
    expect(colNames).toContain('content')
    expect(colNames).toContain('raw_data')
    expect(colNames).toContain('generated_at')
    expect(colNames).toContain('acknowledged_at')
  })

  it('should accept daily and weekly type values', () => {
    db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data) VALUES (?, ?, ?, ?, ?)`).run(
      'brief_001', clawId, 'daily', '# Daily Briefing', '{}'
    )
    db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data) VALUES (?, ?, ?, ?, ?)`).run(
      'brief_002', clawId, 'weekly', '# Weekly Briefing', '{}'
    )
    const count = db.prepare("SELECT COUNT(*) as cnt FROM briefings").get() as { cnt: number }
    expect(count.cnt).toBe(2)
  })

  it('should reject invalid type values', () => {
    expect(() => {
      db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data) VALUES (?, ?, ?, ?, ?)`).run(
        'brief_bad', clawId, 'monthly', '# Bad', '{}'
      )
    }).toThrow()
  })

  it('should have nullable acknowledged_at', () => {
    db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data) VALUES (?, ?, ?, ?, ?)`).run(
      'brief_003', clawId, 'daily', '# Test', '{}'
    )
    const row = db.prepare("SELECT acknowledged_at FROM briefings WHERE id = 'brief_003'").get() as { acknowledged_at: string | null }
    expect(row.acknowledged_at).toBeNull()
  })

  it('should allow setting acknowledged_at', () => {
    db.prepare(`INSERT INTO briefings (id, claw_id, type, content, raw_data) VALUES (?, ?, ?, ?, ?)`).run(
      'brief_004', clawId, 'daily', '# Test', '{}'
    )
    db.prepare(`UPDATE briefings SET acknowledged_at = ? WHERE id = 'brief_004'`).run('2026-02-20T08:00:00Z')
    const row = db.prepare("SELECT acknowledged_at FROM briefings WHERE id = 'brief_004'").get() as { acknowledged_at: string }
    expect(row.acknowledged_at).toBe('2026-02-20T08:00:00Z')
  })

  it('should have idx_briefings_claw index', () => {
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_briefings_claw'"
    ).get()
    expect(idx).toBeTruthy()
  })

  it('should have idx_briefings_unread index', () => {
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_briefings_unread'"
    ).get()
    expect(idx).toBeTruthy()
  })

  it('should default raw_data to empty JSON object', () => {
    db.prepare(`INSERT INTO briefings (id, claw_id, type, content) VALUES (?, ?, ?, ?)`).run(
      'brief_005', clawId, 'daily', '# Default raw_data test'
    )
    const row = db.prepare("SELECT raw_data FROM briefings WHERE id = 'brief_005'").get() as { raw_data: string }
    expect(row.raw_data).toBe('{}')
  })
})
