/**
 * SQLite DraftRepository（Phase 11 T4）
 */

import type Database from 'better-sqlite3'
import type {
  DraftRecord,
  DraftStatus,
  IDraftRepository,
} from '../interfaces/draft.repository.interface.js'

interface DraftRow {
  id: string
  claw_id: string
  to_claw_id: string
  content: string
  reason: string
  status: string
  created_at: string
  expires_at: string | null
  approved_at: string | null
  rejected_at: string | null
  sent_message_id: string | null
}

function rowToRecord(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    toClawId: row.to_claw_id,
    content: row.content,
    reason: row.reason,
    status: row.status as DraftStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    sentMessageId: row.sent_message_id,
  }
}

export class SQLiteDraftRepository implements IDraftRepository {
  constructor(private db: Database.Database) {}

  async create(data: {
    id: string
    clawId: string
    toClawId: string
    content: string
    reason: string
    expiresAt?: string
  }): Promise<DraftRecord> {
    const createdAt = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO drafts (id, claw_id, to_claw_id, content, reason, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(data.id, data.clawId, data.toClawId, data.content, data.reason, createdAt, data.expiresAt ?? null)

    return {
      id: data.id,
      clawId: data.clawId,
      toClawId: data.toClawId,
      content: data.content,
      reason: data.reason,
      status: 'pending',
      createdAt,
      expiresAt: data.expiresAt ?? null,
      approvedAt: null,
      rejectedAt: null,
      sentMessageId: null,
    }
  }

  async findByOwner(
    clawId: string,
    filters?: { status?: DraftStatus; limit?: number; offset?: number },
  ): Promise<DraftRecord[]> {
    const limit = Math.min(filters?.limit ?? 20, 100)
    const offset = filters?.offset ?? 0
    let sql = `SELECT * FROM drafts WHERE claw_id = ?`
    const params: (string | number)[] = [clawId]
    if (filters?.status) {
      sql += ` AND status = ?`
      params.push(filters.status)
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const rows = this.db.prepare(sql).all(...params) as DraftRow[]
    return rows.map(rowToRecord)
  }

  async findById(id: string): Promise<DraftRecord | null> {
    const row = this.db.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as DraftRow | undefined
    return row ? rowToRecord(row) : null
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    meta?: { sentMessageId?: string },
  ): Promise<DraftRecord> {
    const now = new Date().toISOString()
    const approvedAt = status === 'approved' ? now : null
    const rejectedAt = status === 'rejected' ? now : null

    this.db
      .prepare(
        `UPDATE drafts SET status = ?, approved_at = ?, rejected_at = ?, sent_message_id = ?
         WHERE id = ?`,
      )
      .run(status, approvedAt, rejectedAt, meta?.sentMessageId ?? null, id)

    const updated = this.db.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as DraftRow
    return rowToRecord(updated)
  }

  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(`DELETE FROM drafts WHERE expires_at IS NOT NULL AND expires_at < ? AND status = 'pending'`)
      .run(now)
    return result.changes
  }
}
