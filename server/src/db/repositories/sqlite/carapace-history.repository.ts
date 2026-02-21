/**
 * SQLite CarapaceHistoryRepository（Phase 10）
 * carapace.md 版本历史的 SQLite 实现
 */

import type Database from 'better-sqlite3'
import type {
  CarapaceChangeReason,
  CarapaceHistoryRecord,
  ICarapaceHistoryRepository,
} from '../interfaces/carapace-history.repository.interface.js'

interface CarapaceHistoryRow {
  id: string
  claw_id: string
  version: number
  content: string
  change_reason: string
  suggested_by: string
  created_at: string
}

function rowToRecord(row: CarapaceHistoryRow): CarapaceHistoryRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    version: row.version,
    content: row.content,
    changeReason: row.change_reason as CarapaceChangeReason,
    suggestedBy: row.suggested_by as 'system' | 'user',
    createdAt: row.created_at,
  }
}

export class SQLiteCarapaceHistoryRepository implements ICarapaceHistoryRepository {
  constructor(private db: Database.Database) {}

  async create(data: {
    id: string
    clawId: string
    content: string
    changeReason: CarapaceChangeReason
    suggestedBy: 'system' | 'user'
  }): Promise<CarapaceHistoryRecord> {
    const createdAt = new Date().toISOString()

    // 原子操作：用子查询在单条 INSERT 中计算版本号，避免并发竞态
    this.db
      .prepare(
        `INSERT INTO carapace_history (id, claw_id, version, content, change_reason, suggested_by, created_at)
         VALUES (?, ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM carapace_history WHERE claw_id = ?), ?, ?, ?, ?)`,
      )
      .run(data.id, data.clawId, data.clawId, data.content, data.changeReason, data.suggestedBy, createdAt)

    // 读取实际插入的版本号（由子查询生成）
    const inserted = this.db
      .prepare(`SELECT version FROM carapace_history WHERE id = ?`)
      .get(data.id) as { version: number }

    return {
      id: data.id,
      clawId: data.clawId,
      version: inserted.version,
      content: data.content,
      changeReason: data.changeReason,
      suggestedBy: data.suggestedBy,
      createdAt,
    }
  }

  async getLatestVersion(clawId: string): Promise<number> {
    const row = this.db
      .prepare(`SELECT MAX(version) as max_version FROM carapace_history WHERE claw_id = ?`)
      .get(clawId) as { max_version: number | null }
    return row.max_version ?? 0
  }

  async findByOwner(
    clawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<CarapaceHistoryRecord[]> {
    const limit = Math.min(filters?.limit ?? 20, 50)
    const offset = filters?.offset ?? 0
    const rows = this.db
      .prepare(
        `SELECT * FROM carapace_history WHERE claw_id = ? ORDER BY version DESC LIMIT ? OFFSET ?`,
      )
      .all(clawId, limit, offset) as CarapaceHistoryRow[]
    return rows.map(rowToRecord)
  }

  async findByVersion(clawId: string, version: number): Promise<CarapaceHistoryRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM carapace_history WHERE claw_id = ? AND version = ?`)
      .get(clawId, version) as CarapaceHistoryRow | undefined
    return row ? rowToRecord(row) : null
  }

  async pruneOldVersions(clawId: string, keepCount: number): Promise<number> {
    // 找出需要保留的最小 version
    const minKept = this.db
      .prepare(
        `SELECT MIN(version) as min_version FROM (
           SELECT version FROM carapace_history WHERE claw_id = ? ORDER BY version DESC LIMIT ?
         )`,
      )
      .get(clawId, keepCount) as { min_version: number | null }

    if (minKept.min_version === null) return 0

    const result = this.db
      .prepare(`DELETE FROM carapace_history WHERE claw_id = ? AND version < ?`)
      .run(clawId, minKept.min_version)

    return result.changes
  }
}
