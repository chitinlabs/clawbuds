/**
 * SQLite BriefingRepository（Phase 6）
 */

import type Database from 'better-sqlite3'
import type { BriefingRecord, IBriefingRepository } from '../interfaces/briefing.repository.interface.js'

interface BriefingRow {
  id: string
  claw_id: string
  type: string
  content: string
  raw_data: string
  generated_at: string
  acknowledged_at: string | null
}

function rowToBriefing(row: BriefingRow): BriefingRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    type: row.type as 'daily' | 'weekly',
    content: row.content,
    rawData: JSON.parse(row.raw_data) as Record<string, unknown>,
    generatedAt: row.generated_at,
    acknowledgedAt: row.acknowledged_at,
  }
}

export class SQLiteBriefingRepository implements IBriefingRepository {
  constructor(private db: Database.Database) {}

  async create(data: {
    id: string
    clawId: string
    type: 'daily' | 'weekly'
    content: string
    rawData: Record<string, unknown>
  }): Promise<BriefingRecord> {
    const generatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO briefings (id, claw_id, type, content, raw_data, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.clawId,
      data.type,
      data.content,
      JSON.stringify(data.rawData),
      generatedAt,
    )
    return {
      id: data.id,
      clawId: data.clawId,
      type: data.type,
      content: data.content,
      rawData: data.rawData,
      generatedAt,
      acknowledgedAt: null,
    }
  }

  async findLatest(clawId: string): Promise<BriefingRecord | null> {
    const row = this.db.prepare(`
      SELECT * FROM briefings
      WHERE claw_id = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get(clawId) as BriefingRow | undefined
    return row ? rowToBriefing(row) : null
  }

  async findHistory(
    clawId: string,
    filters?: { type?: 'daily' | 'weekly'; limit?: number; offset?: number }
  ): Promise<BriefingRecord[]> {
    const limit = Math.min(filters?.limit ?? 10, 50)
    const offset = filters?.offset ?? 0
    let sql = 'SELECT * FROM briefings WHERE claw_id = ?'
    const params: (string | number)[] = [clawId]
    if (filters?.type) {
      sql += ' AND type = ?'
      params.push(filters.type)
    }
    sql += ' ORDER BY generated_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const rows = this.db.prepare(sql).all(...params) as BriefingRow[]
    return rows.map(rowToBriefing)
  }

  async acknowledge(id: string, acknowledgedAt: string): Promise<void> {
    this.db.prepare(`
      UPDATE briefings SET acknowledged_at = ? WHERE id = ?
    `).run(acknowledgedAt, id)
  }

  async getUnreadCount(clawId: string): Promise<number> {
    const result = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM briefings
      WHERE claw_id = ? AND acknowledged_at IS NULL
    `).get(clawId) as { cnt: number }
    return result.cnt
  }

  async deleteOlderThan(clawId: string, cutoffDate: string): Promise<number> {
    const result = this.db.prepare(`
      DELETE FROM briefings WHERE claw_id = ? AND generated_at < ?
    `).run(clawId, cutoffDate)
    return result.changes
  }
}
