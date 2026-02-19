/**
 * SQLite ReflexExecutionRepository Implementation (Phase 4)
 */

import type Database from 'better-sqlite3'
import type {
  IReflexExecutionRepository,
  ReflexExecutionRecord,
  ExecutionResult,
} from '../interfaces/reflex.repository.interface.js'

interface ReflexExecutionRow {
  id: string
  reflex_id: string
  claw_id: string
  event_type: string
  trigger_data: string   // JSON TEXT
  execution_result: string
  details: string        // JSON TEXT
  created_at: string
}

function rowToRecord(row: ReflexExecutionRow): ReflexExecutionRecord {
  return {
    id: row.id,
    reflexId: row.reflex_id,
    clawId: row.claw_id,
    eventType: row.event_type,
    triggerData: JSON.parse(row.trigger_data) as Record<string, unknown>,
    executionResult: row.execution_result as ExecutionResult,
    details: JSON.parse(row.details) as Record<string, unknown>,
    createdAt: row.created_at,
  }
}

export class SQLiteReflexExecutionRepository implements IReflexExecutionRepository {
  constructor(private db: Database.Database) {}

  async create(data: {
    id: string
    reflexId: string
    clawId: string
    eventType: string
    triggerData: Record<string, unknown>
    executionResult: ExecutionResult
    details: Record<string, unknown>
  }): Promise<ReflexExecutionRecord> {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO reflex_executions
           (id, reflex_id, claw_id, event_type, trigger_data, execution_result, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.reflexId,
        data.clawId,
        data.eventType,
        JSON.stringify(data.triggerData),
        data.executionResult,
        JSON.stringify(data.details),
        now,
      )
    const row = this.db
      .prepare(`SELECT * FROM reflex_executions WHERE id = ?`)
      .get(data.id) as ReflexExecutionRow
    return rowToRecord(row)
  }

  async findRecent(clawId: string, limit: number): Promise<ReflexExecutionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM reflex_executions WHERE claw_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(clawId, limit) as ReflexExecutionRow[]
    return rows.map(rowToRecord)
  }

  async findByResult(
    clawId: string,
    result: ExecutionResult,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]> {
    let sql = `SELECT * FROM reflex_executions WHERE claw_id = ? AND execution_result = ?`
    const params: unknown[] = [clawId, result]
    if (since) {
      sql += ` AND created_at >= ?`
      params.push(since)
    }
    sql += ` ORDER BY created_at DESC`
    if (limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(limit)
    }
    const rows = this.db.prepare(sql).all(...params) as ReflexExecutionRow[]
    return rows.map(rowToRecord)
  }

  async getStats(
    reflexId: string,
    since?: string,
  ): Promise<{ total: number; executed: number; blocked: number; queuedForL1: number }> {
    let sql = `SELECT execution_result, COUNT(*) as cnt FROM reflex_executions WHERE reflex_id = ?`
    const params: unknown[] = [reflexId]
    if (since) {
      sql += ` AND created_at >= ?`
      params.push(since)
    }
    sql += ` GROUP BY execution_result`
    const rows = this.db.prepare(sql).all(...params) as { execution_result: string; cnt: number }[]
    const map: Record<string, number> = {}
    for (const r of rows) {
      map[r.execution_result] = r.cnt
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return {
      total,
      executed: map['executed'] ?? 0,
      blocked: map['blocked'] ?? 0,
      queuedForL1: map['queued_for_l1'] ?? 0,
    }
  }

  async findAlerts(
    clawId: string,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]> {
    // Find executions from reflexes with behavior='alert'
    let sql = `
      SELECT re.* FROM reflex_executions re
      JOIN reflexes r ON r.id = re.reflex_id
      WHERE re.claw_id = ? AND r.behavior = 'alert'
    `
    const params: unknown[] = [clawId]
    if (since) {
      sql += ` AND re.created_at >= ?`
      params.push(since)
    }
    sql += ` ORDER BY re.created_at DESC`
    if (limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(limit)
    }
    const rows = this.db.prepare(sql).all(...params) as ReflexExecutionRow[]
    return rows.map(rowToRecord)
  }

  async deleteOlderThan(cutoffDate: string): Promise<number> {
    const result = this.db
      .prepare(`DELETE FROM reflex_executions WHERE created_at < ?`)
      .run(cutoffDate)
    return result.changes
  }
}
