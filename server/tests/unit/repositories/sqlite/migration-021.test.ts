/**
 * Migration 021: drafts 表（Phase 11 T4）
 * 草稿系统：pending → approved/rejected/expired
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'

function setupTestClaw(db: Database.Database): void {
  db.prepare(`INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','Alice')`).run()
}

describe('Migration 021: drafts table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
    setupTestClaw(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should create drafts table', () => {
    expect(() => {
      db.prepare(`SELECT * FROM drafts LIMIT 1`).all()
    }).not.toThrow()
  })

  it('should insert a pending draft', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO drafts (id, claw_id, to_claw_id, content, reason)
        VALUES ('draft-1', 'claw-a', 'claw-b', '{"blocks":[]}', 'groom_request')
      `).run()
    }).not.toThrow()
  })

  it('should default status to pending', () => {
    db.prepare(`
      INSERT INTO drafts (id, claw_id, to_claw_id, content, reason)
      VALUES ('draft-2', 'claw-a', 'claw-b', '{}', 'test')
    `).run()
    const row = db.prepare(`SELECT status FROM drafts WHERE id = 'draft-2'`).get() as { status: string }
    expect(row.status).toBe('pending')
  })

  it('should allow all valid status values', () => {
    for (const status of ['pending', 'approved', 'rejected', 'expired']) {
      expect(() => {
        db.prepare(`
          INSERT INTO drafts (id, claw_id, to_claw_id, content, reason, status)
          VALUES ('draft-${status}', 'claw-a', 'claw-b', '{}', 'test', '${status}')
        `).run()
      }).not.toThrow()
    }
  })

  it('should reject invalid status', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO drafts (id, claw_id, to_claw_id, content, reason, status)
        VALUES ('draft-bad', 'claw-a', 'claw-b', '{}', 'test', 'invalid_status')
      `).run()
    }).toThrow()
  })

  it('should cascade delete when claw is deleted', () => {
    db.prepare(`
      INSERT INTO drafts (id, claw_id, to_claw_id, content, reason)
      VALUES ('draft-cascade', 'claw-a', 'claw-b', '{}', 'test')
    `).run()
    db.prepare(`DELETE FROM claws WHERE claw_id = 'claw-a'`).run()
    const count = (db.prepare(`SELECT COUNT(*) as cnt FROM drafts WHERE claw_id = 'claw-a'`).get() as { cnt: number }).cnt
    expect(count).toBe(0)
  })
})
