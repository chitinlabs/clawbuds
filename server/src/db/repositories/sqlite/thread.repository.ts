/**
 * SQLite ThreadRepository 实现（Phase 8）
 * 处理 threads_v5 + thread_participants 数据访问
 */

import type Database from 'better-sqlite3'
import type {
  IThreadRepository,
  ThreadRecord,
  ThreadParticipantRecord,
  ThreadPurpose,
  ThreadStatus,
} from '../interfaces/thread.repository.interface.js'

interface ThreadRow {
  id: string
  creator_id: string
  purpose: string
  title: string
  status: string
  created_at: string
  updated_at: string
}

interface ParticipantRow {
  thread_id: string
  claw_id: string
  joined_at: string
}

function mapThread(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    creatorId: row.creator_id,
    purpose: row.purpose as ThreadPurpose,
    title: row.title,
    status: row.status as ThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapParticipant(row: ParticipantRow): ThreadParticipantRecord {
  return {
    threadId: row.thread_id,
    clawId: row.claw_id,
    joinedAt: row.joined_at,
  }
}

export class SQLiteThreadRepository implements IThreadRepository {
  constructor(private readonly db: Database.Database) {}

  async create(data: {
    id: string
    creatorId: string
    purpose: ThreadPurpose
    title: string
  }): Promise<ThreadRecord> {
    this.db
      .prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title)
         VALUES (?, ?, ?, ?)`,
      )
      .run(data.id, data.creatorId, data.purpose, data.title)
    const row = this.db
      .prepare('SELECT * FROM threads_v5 WHERE id = ?')
      .get(data.id) as ThreadRow
    return mapThread(row)
  }

  async findById(id: string): Promise<ThreadRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM threads_v5 WHERE id = ?')
      .get(id) as ThreadRow | undefined
    return row ? mapThread(row) : null
  }

  async findByParticipant(
    clawId: string,
    filters?: {
      status?: ThreadStatus
      purpose?: ThreadPurpose
      limit?: number
      offset?: number
    },
  ): Promise<ThreadRecord[]> {
    const conditions: string[] = ['tp.claw_id = ?']
    const params: unknown[] = [clawId]

    if (filters?.status) {
      conditions.push('t.status = ?')
      params.push(filters.status)
    }
    if (filters?.purpose) {
      conditions.push('t.purpose = ?')
      params.push(filters.purpose)
    }

    let sql = `
      SELECT t.* FROM threads_v5 t
      INNER JOIN thread_participants tp ON t.id = tp.thread_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.updated_at DESC
    `

    if (filters?.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(filters.limit)
    }
    if (filters?.offset !== undefined) {
      sql += ` OFFSET ?`
      params.push(filters.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as ThreadRow[]
    return rows.map(mapThread)
  }

  async updateStatus(id: string, status: ThreadStatus): Promise<void> {
    this.db
      .prepare(
        `UPDATE threads_v5
         SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(status, id)
  }

  async touch(id: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE threads_v5
         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(id)
  }

  async addParticipant(threadId: string, clawId: string): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO thread_participants (thread_id, claw_id)
         VALUES (?, ?)`,
      )
      .run(threadId, clawId)
  }

  async removeParticipant(threadId: string, clawId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM thread_participants WHERE thread_id = ? AND claw_id = ?')
      .run(threadId, clawId)
  }

  async isParticipant(threadId: string, clawId: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM thread_participants WHERE thread_id = ? AND claw_id = ?')
      .get(threadId, clawId)
    return row !== undefined
  }

  async getParticipants(threadId: string): Promise<ThreadParticipantRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM thread_participants WHERE thread_id = ?')
      .all(threadId) as ParticipantRow[]
    return rows.map(mapParticipant)
  }

  async getContributionCount(threadId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM thread_contributions WHERE thread_id = ?')
      .get(threadId) as { cnt: number }
    return row.cnt
  }
}
