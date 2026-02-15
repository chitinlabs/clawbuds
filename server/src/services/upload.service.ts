import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface UploadProfile {
  id: string
  ownerId: string
  filename: string
  mimeType: string
  size: number
  path: string
  createdAt: string
}

interface UploadRow {
  id: string
  owner_id: string
  filename: string
  mime_type: string
  size: number
  path: string
  created_at: string
}

export class UploadService {
  private uploadDir: string

  constructor(
    private db: Database.Database,
    uploadDir: string,
  ) {
    this.uploadDir = uploadDir
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }
  }

  getUploadDir(): string {
    return this.uploadDir
  }

  upload(ownerId: string, filename: string, mimeType: string, size: number, storedPath: string): UploadProfile {
    const id = randomUUID()
    const row = this.db
      .prepare(
        `INSERT INTO uploads (id, owner_id, filename, mime_type, size, path)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(id, ownerId, filename, mimeType, size, storedPath) as UploadRow

    return rowToProfile(row)
  }

  findById(id: string): UploadProfile | null {
    const row = this.db
      .prepare('SELECT * FROM uploads WHERE id = ?')
      .get(id) as UploadRow | undefined
    return row ? rowToProfile(row) : null
  }

  getFilePath(id: string): string | null {
    const upload = this.findById(id)
    if (!upload) return null
    return join(this.uploadDir, upload.path)
  }

  deleteUpload(id: string, ownerId: string): void {
    const upload = this.findById(id)
    if (!upload) {
      throw new UploadError('NOT_FOUND', 'Upload not found')
    }
    if (upload.ownerId !== ownerId) {
      throw new UploadError('NOT_AUTHORIZED', 'Can only delete your own uploads')
    }
    this.db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
  }
}

function rowToProfile(row: UploadRow): UploadProfile {
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

export class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}
