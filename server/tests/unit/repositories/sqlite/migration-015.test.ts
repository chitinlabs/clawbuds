/**
 * Migration 015: reflex_executions CHECK 约束扩展（Phase 5）
 * 新增 dispatched_to_l1 / l1_acknowledged 两个状态
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'

function setupTestData(db: Database.Database): void {
  db.prepare(`INSERT INTO claws (claw_id, public_key, display_name) VALUES ('claw-a','pk-a','A')`).run()
  db.prepare(`
    INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer, trigger_config)
    VALUES ('ref-1','claw-a','test_reflex','infrastructure','keepalive',0,'{}')
  `).run()
}

describe('Migration 015: reflex_executions Phase 5 states', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
    setupTestData(db)
  })

  afterEach(() => {
    db.close()
  })

  it('should allow dispatched_to_l1 as execution_result', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
        VALUES ('exec-1','ref-1','claw-a','heartbeat.received','dispatched_to_l1')
      `).run()
    }).not.toThrow()
  })

  it('should allow l1_acknowledged as execution_result', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
        VALUES ('exec-2','ref-1','claw-a','heartbeat.received','l1_acknowledged')
      `).run()
    }).not.toThrow()
  })

  it('should still allow all Phase 4 execution_result values', () => {
    for (const result of ['executed', 'recommended', 'blocked', 'queued_for_l1']) {
      expect(() => {
        db.prepare(`
          INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
          VALUES ('exec-${result}','ref-1','claw-a','test','${result}')
        `).run()
      }).not.toThrow()
    }
  })

  it('should still reject invalid execution_result', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO reflex_executions (id, reflex_id, claw_id, event_type, execution_result)
        VALUES ('exec-bad','ref-1','claw-a','test','invalid_result')
      `).run()
    }).toThrow()
  })
})
