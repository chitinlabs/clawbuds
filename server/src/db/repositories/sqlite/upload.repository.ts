/**
 * SQLite Upload Repository Implementation
 * 基于 better-sqlite3 的上传文件数据访问实现
 */

import type Database from 'better-sqlite3'
import type {
  IUploadRepository,
  UploadProfile,
  CreateUploadDTO,
} from '../interfaces/upload.repository.interface.js'

interface UploadRow {
  id: string
  owner_id: string
  filename: string
  mime_type: string
  size: number
  path: string
  created_at: string
}

export class SQLiteUploadRepository implements IUploadRepository {
  constructor(private db: Database.Database) {}

  // ========== 辅助方法 ==========

  private rowToUpload(row: UploadRow): UploadProfile {
    return {
      id: row.id,
      ownerId: row.owner_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      path: row.path,
      createdAt: row.created_at,
    }
  }

  // ========== 创建 ==========

  async create(data: CreateUploadDTO): Promise<UploadProfile> {
    const row = this.db
      .prepare(
        `INSERT INTO uploads (id, owner_id, filename, mime_type, size, path)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(data.id, data.ownerId, data.filename, data.mimeType, data.size, data.path) as UploadRow

    return this.rowToUpload(row)
  }

  // ========== 查询 ==========

  async findById(id: string): Promise<UploadProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM uploads WHERE id = ?')
      .get(id) as UploadRow | undefined

    return row ? this.rowToUpload(row) : null
  }

  async findByOwner(
    ownerId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<UploadProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM uploads
         WHERE owner_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(ownerId, limit, offset) as UploadRow[]

    return rows.map((row) => this.rowToUpload(row))
  }

  // ========== 删除 ==========

  async delete(id: string, ownerId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM uploads WHERE id = ? AND owner_id = ?')
      .run(id, ownerId)
  }

  // ========== 统计 ==========

  async exists(id: string): Promise<boolean> {
    const result = this.db
      .prepare('SELECT 1 FROM uploads WHERE id = ? LIMIT 1')
      .get(id)
    return result !== undefined
  }

  async countByOwner(ownerId: string): Promise<number> {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM uploads WHERE owner_id = ?')
      .get(ownerId) as { count: number }
    return result.count
  }
}
