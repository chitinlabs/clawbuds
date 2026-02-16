/**
 * SQLite Claw Repository Implementation
 * 基于 better-sqlite3 的用户数据访问实现
 */

import type Database from 'better-sqlite3'
import type {
  IClawRepository,
  RegisterClawDTO,
  UpdateClawDTO,
  UpdateAutonomyConfigDTO,
} from '../interfaces/claw.repository.interface.js'
import type { Claw } from '@clawbuds/shared/types/claw'
import { randomUUID } from 'node:crypto'

interface ClawRow {
  claw_id: string
  public_key: string
  display_name: string
  bio: string
  status: 'active' | 'suspended' | 'deactivated'
  created_at: string
  last_seen_at: string
  claw_type: 'personal' | 'service' | 'bot'
  discoverable: number
  tags: string
  capabilities: string
  avatar_url: string | null
  autonomy_level: 'notifier' | 'drafter' | 'autonomous' | 'delegator'
  autonomy_config: string
  brain_provider: string
  notification_prefs: string
}

export class SQLiteClawRepository implements IClawRepository {
  constructor(private db: Database.Database) {}

  // ========== 辅助方法 ==========

  private rowToClaw(row: ClawRow): Claw {
    return {
      clawId: row.claw_id,
      publicKey: row.public_key,
      displayName: row.display_name,
      bio: row.bio,
      status: row.status,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      clawType: row.claw_type,
      discoverable: Boolean(row.discoverable),
      tags: JSON.parse(row.tags),
      capabilities: JSON.parse(row.capabilities),
      avatarUrl: row.avatar_url ?? undefined,
      autonomyLevel: row.autonomy_level,
      autonomyConfig: JSON.parse(row.autonomy_config),
      brainProvider: row.brain_provider,
      notificationPrefs: JSON.parse(row.notification_prefs),
    }
  }

  // ========== 创建 ==========

  async register(data: RegisterClawDTO): Promise<Claw> {
    const clawId = randomUUID()
    const tags = JSON.stringify(data.tags ?? [])
    const discoverable = data.discoverable ?? false ? 1 : 0

    this.db
      .prepare(
        `INSERT INTO claws (claw_id, public_key, display_name, bio, discoverable, tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(clawId, data.publicKey, data.displayName, data.bio ?? '', discoverable, tags)

    const row = this.db
      .prepare('SELECT * FROM claws WHERE claw_id = ?')
      .get(clawId) as ClawRow

    return this.rowToClaw(row)
  }

  // ========== 查询 ==========

  async findById(clawId: string): Promise<Claw | null> {
    const row = this.db
      .prepare('SELECT * FROM claws WHERE claw_id = ?')
      .get(clawId) as ClawRow | undefined

    return row ? this.rowToClaw(row) : null
  }

  async findByPublicKey(publicKey: string): Promise<Claw | null> {
    const row = this.db
      .prepare('SELECT * FROM claws WHERE public_key = ?')
      .get(publicKey) as ClawRow | undefined

    return row ? this.rowToClaw(row) : null
  }

  async findMany(clawIds: string[]): Promise<Claw[]> {
    if (clawIds.length === 0) return []

    const placeholders = clawIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM claws WHERE claw_id IN (${placeholders})`)
      .all(...clawIds) as ClawRow[]

    return rows.map((row) => this.rowToClaw(row))
  }

  async findDiscoverable(options?: {
    limit?: number
    offset?: number
    tags?: string[]
  }): Promise<Claw[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0
    const tags = options?.tags

    let query = 'SELECT * FROM claws WHERE discoverable = 1 AND status = ?'
    const params: any[] = ['active']

    // 如果指定了 tags，需要过滤
    if (tags && tags.length > 0) {
      // SQLite JSON 查询比较复杂，这里简化为 LIKE 查询
      query += ` AND (${tags.map(() => 'tags LIKE ?').join(' OR ')})`
      tags.forEach((tag) => params.push(`%"${tag}"%`))
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = this.db.prepare(query).all(...params) as ClawRow[]
    return rows.map((row) => this.rowToClaw(row))
  }

  // ========== 更新 ==========

  async updateProfile(
    clawId: string,
    updates: UpdateClawDTO,
  ): Promise<Claw | null> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.displayName !== undefined) {
      fields.push('display_name = ?')
      values.push(updates.displayName)
    }
    if (updates.bio !== undefined) {
      fields.push('bio = ?')
      values.push(updates.bio)
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.discoverable !== undefined) {
      fields.push('discoverable = ?')
      values.push(updates.discoverable ? 1 : 0)
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?')
      values.push(updates.avatarUrl)
    }

    if (fields.length === 0) {
      return this.findById(clawId)
    }

    values.push(clawId)

    const result = this.db
      .prepare(`UPDATE claws SET ${fields.join(', ')} WHERE claw_id = ?`)
      .run(...values)

    if (result.changes === 0) {
      return null
    }

    return this.findById(clawId)
  }

  async updateLastSeen(clawId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE claws SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ?`,
      )
      .run(clawId)
  }

  async updateAutonomyConfig(
    clawId: string,
    config: UpdateAutonomyConfigDTO,
  ): Promise<Claw | null> {
    const fields: string[] = []
    const values: any[] = []

    if (config.autonomyLevel !== undefined) {
      fields.push('autonomy_level = ?')
      values.push(config.autonomyLevel)
    }
    if (config.autonomyConfig !== undefined) {
      fields.push('autonomy_config = ?')
      values.push(JSON.stringify(config.autonomyConfig))
    }

    if (fields.length === 0) {
      return this.findById(clawId)
    }

    values.push(clawId)

    const result = this.db
      .prepare(`UPDATE claws SET ${fields.join(', ')} WHERE claw_id = ?`)
      .run(...values)

    if (result.changes === 0) {
      return null
    }

    return this.findById(clawId)
  }

  async updateNotificationPrefs(clawId: string, prefs: any): Promise<Claw | null> {
    const result = this.db
      .prepare('UPDATE claws SET notification_prefs = ? WHERE claw_id = ?')
      .run(JSON.stringify(prefs), clawId)

    if (result.changes === 0) {
      return null
    }

    return this.findById(clawId)
  }

  // ========== 删除（软删除）==========

  async deactivate(clawId: string): Promise<void> {
    this.db
      .prepare("UPDATE claws SET status = 'deactivated' WHERE claw_id = ?")
      .run(clawId)
  }

  // ========== 统计 ==========

  async exists(clawId: string): Promise<boolean> {
    const result = this.db
      .prepare('SELECT 1 FROM claws WHERE claw_id = ? LIMIT 1')
      .get(clawId)
    return result !== undefined
  }

  async count(filters?: { status?: string; discoverable?: boolean }): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM claws WHERE 1=1'
    const params: any[] = []

    if (filters?.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters?.discoverable !== undefined) {
      query += ' AND discoverable = ?'
      params.push(filters.discoverable ? 1 : 0)
    }

    const result = this.db.prepare(query).get(...params) as { count: number }
    return result.count
  }
}
