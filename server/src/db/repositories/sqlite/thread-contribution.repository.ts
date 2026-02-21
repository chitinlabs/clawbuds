/**
 * SQLite ThreadContributionRepository 实现（Phase 8）
 * 处理 thread_contributions（E2EE）数据访问
 */

import type Database from 'better-sqlite3'
import type {
  IThreadContributionRepository,
  ThreadContributionRecord,
  ContributionType,
} from '../interfaces/thread.repository.interface.js'

interface ContributionRow {
  id: string
  thread_id: string
  contributor_id: string
  encrypted_content: string
  nonce: string
  content_type: string
  created_at: string
}

function mapContribution(row: ContributionRow): ThreadContributionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    contributorId: row.contributor_id,
    encryptedContent: row.encrypted_content,
    nonce: row.nonce,
    contentType: row.content_type as ContributionType,
    createdAt: row.created_at,
  }
}

export class SQLiteThreadContributionRepository implements IThreadContributionRepository {
  constructor(private readonly db: Database.Database) {}

  async create(data: {
    id: string
    threadId: string
    contributorId: string
    encryptedContent: string
    nonce: string
    contentType: ContributionType
  }): Promise<ThreadContributionRecord> {
    this.db
      .prepare(
        `INSERT INTO thread_contributions
         (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.threadId,
        data.contributorId,
        data.encryptedContent,
        data.nonce,
        data.contentType,
      )
    const row = this.db
      .prepare('SELECT * FROM thread_contributions WHERE id = ?')
      .get(data.id) as ContributionRow
    return mapContribution(row)
  }

  async findByThread(
    threadId: string,
    filters?: {
      since?: string
      limit?: number
      offset?: number
    },
  ): Promise<ThreadContributionRecord[]> {
    const conditions: string[] = ['thread_id = ?']
    const params: unknown[] = [threadId]

    if (filters?.since) {
      conditions.push('created_at > ?')
      params.push(filters.since)
    }

    let sql = `
      SELECT * FROM thread_contributions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ASC
    `

    if (filters?.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(filters.limit)
    }
    if (filters?.offset !== undefined) {
      sql += ` OFFSET ?`
      params.push(filters.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as ContributionRow[]
    return rows.map(mapContribution)
  }

  async countByThread(threadId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM thread_contributions WHERE thread_id = ?')
      .get(threadId) as { cnt: number }
    return row.cnt
  }

  async findByContributor(
    threadId: string,
    contributorId: string,
  ): Promise<ThreadContributionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM thread_contributions
         WHERE thread_id = ? AND contributor_id = ?
         ORDER BY created_at ASC`,
      )
      .all(threadId, contributorId) as ContributionRow[]
    return rows.map(mapContribution)
  }
}
