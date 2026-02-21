/**
 * SQLite ThreadKeyRepository 实现（Phase 8）
 * 处理 thread_keys（E2EE 密钥份额）数据访问
 */

import type Database from 'better-sqlite3'
import type {
  IThreadKeyRepository,
  ThreadKeyRecord,
} from '../interfaces/thread.repository.interface.js'

interface ThreadKeyRow {
  thread_id: string
  claw_id: string
  encrypted_key: string
  distributed_by: string
  created_at: string
}

function mapThreadKey(row: ThreadKeyRow): ThreadKeyRecord {
  return {
    threadId: row.thread_id,
    clawId: row.claw_id,
    encryptedKey: row.encrypted_key,
    distributedBy: row.distributed_by,
    createdAt: row.created_at,
  }
}

export class SQLiteThreadKeyRepository implements IThreadKeyRepository {
  constructor(private readonly db: Database.Database) {}

  async upsert(data: {
    threadId: string
    clawId: string
    encryptedKey: string
    distributedBy: string
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_id, claw_id) DO UPDATE SET
           encrypted_key = excluded.encrypted_key,
           distributed_by = excluded.distributed_by,
           created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(data.threadId, data.clawId, data.encryptedKey, data.distributedBy)
  }

  async findByThreadAndClaw(threadId: string, clawId: string): Promise<ThreadKeyRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM thread_keys WHERE thread_id = ? AND claw_id = ?')
      .get(threadId, clawId) as ThreadKeyRow | undefined
    return row ? mapThreadKey(row) : null
  }

  async hasKey(threadId: string, clawId: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM thread_keys WHERE thread_id = ? AND claw_id = ?')
      .get(threadId, clawId)
    return row !== undefined
  }

  async findByThread(threadId: string): Promise<ThreadKeyRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM thread_keys WHERE thread_id = ?')
      .all(threadId) as ThreadKeyRow[]
    return rows.map(mapThreadKey)
  }
}
