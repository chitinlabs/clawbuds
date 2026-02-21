/**
 * Migration 017: trust_scores 表结构验证（Phase 7）
 * TDD 红灯：migration 尚未创建时这些测试应失败
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'

describe('Migration 017: trust_scores 表', () => {
  let db: Database.Database
  let clawIdA: string
  let clawIdB: string

  beforeEach(async () => {
    db = createTestDatabase()
    const clawRepo = new SQLiteClawRepository(db)
    const clawA = await clawRepo.register({ publicKey: 'pk-trust-a', displayName: 'TrustA' })
    const clawB = await clawRepo.register({ publicKey: 'pk-trust-b', displayName: 'TrustB' })
    clawIdA = clawA.clawId
    clawIdB = clawB.clawId
  })

  afterEach(() => db.close())

  it('should create trust_scores table', () => {
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trust_scores'")
      .get()
    expect(result).toBeTruthy()
  })

  it('should have all required columns', () => {
    const cols = db.prepare('PRAGMA table_info(trust_scores)').all() as Array<{ name: string }>
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('from_claw_id')
    expect(colNames).toContain('to_claw_id')
    expect(colNames).toContain('domain')
    expect(colNames).toContain('q_score')
    expect(colNames).toContain('h_score')
    expect(colNames).toContain('n_score')
    expect(colNames).toContain('w_score')
    expect(colNames).toContain('composite')
    expect(colNames).toContain('updated_at')
  })

  it('should default domain to _overall', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id) VALUES (?, ?, ?)`
    ).run('ts_001', clawIdA, clawIdB)
    const row = db
      .prepare("SELECT domain FROM trust_scores WHERE id = 'ts_001'")
      .get() as { domain: string }
    expect(row.domain).toBe('_overall')
  })

  it('should default q_score=0.5, n_score=0.5, w_score=0.0, composite=0.5', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id) VALUES (?, ?, ?)`
    ).run('ts_002', clawIdA, clawIdB)
    const row = db
      .prepare('SELECT q_score, n_score, w_score, composite FROM trust_scores WHERE id = ?')
      .get('ts_002') as { q_score: number; n_score: number; w_score: number; composite: number }
    expect(row.q_score).toBe(0.5)
    expect(row.n_score).toBe(0.5)
    expect(row.w_score).toBe(0.0)
    expect(row.composite).toBe(0.5)
  })

  it('should allow h_score to be NULL (not endorsed)', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id) VALUES (?, ?, ?)`
    ).run('ts_003', clawIdA, clawIdB)
    const row = db
      .prepare('SELECT h_score FROM trust_scores WHERE id = ?')
      .get('ts_003') as { h_score: number | null }
    expect(row.h_score).toBeNull()
  })

  it('should allow h_score = 0.0 (explicit low trust)', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, h_score) VALUES (?, ?, ?, ?)`
    ).run('ts_004', clawIdA, clawIdB, 0.0)
    const row = db
      .prepare('SELECT h_score FROM trust_scores WHERE id = ?')
      .get('ts_004') as { h_score: number }
    expect(row.h_score).toBe(0.0)
  })

  it('should enforce UNIQUE(from_claw_id, to_claw_id, domain)', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain) VALUES (?, ?, ?, ?)`
    ).run('ts_005', clawIdA, clawIdB, '_overall')
    expect(() => {
      db.prepare(
        `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain) VALUES (?, ?, ?, ?)`
      ).run('ts_006', clawIdA, clawIdB, '_overall')
    }).toThrow()
  })

  it('should allow same pair in different domains', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain) VALUES (?, ?, ?, ?)`
    ).run('ts_007', clawIdA, clawIdB, '_overall')
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain) VALUES (?, ?, ?, ?)`
    ).run('ts_008', clawIdA, clawIdB, 'AI')
    const count = db
      .prepare('SELECT COUNT(*) as cnt FROM trust_scores WHERE from_claw_id = ? AND to_claw_id = ?')
      .get(clawIdA, clawIdB) as { cnt: number }
    expect(count.cnt).toBe(2)
  })

  it('should reject q_score out of [0,1] range', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, q_score) VALUES (?, ?, ?, ?)`
      ).run('ts_bad_q', clawIdA, clawIdB, 1.5)
    }).toThrow()
  })

  it('should reject composite < 0', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, composite) VALUES (?, ?, ?, ?)`
      ).run('ts_bad_c', clawIdA, clawIdB, -0.1)
    }).toThrow()
  })

  it('should cascade delete when from_claw is deleted', () => {
    db.prepare(
      `INSERT INTO trust_scores (id, from_claw_id, to_claw_id) VALUES (?, ?, ?)`
    ).run('ts_del', clawIdA, clawIdB)
    db.prepare(`DELETE FROM claws WHERE claw_id = ?`).run(clawIdA)
    const row = db
      .prepare('SELECT id FROM trust_scores WHERE id = ?')
      .get('ts_del')
    expect(row).toBeUndefined()
  })

  it('should have idx_trust_from index', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_trust_from'")
      .get()
    expect(idx).toBeTruthy()
  })

  it('should have idx_trust_composite index', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_trust_composite'")
      .get()
    expect(idx).toBeTruthy()
  })
})
