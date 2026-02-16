/**
 * SQLite Group Repository Implementation
 * 基于 better-sqlite3 的群组数据访问实现
 */

import type Database from 'better-sqlite3'
import type {
  IGroupRepository,
  CreateGroupDTO,
  UpdateGroupDTO,
  GroupProfile,
  GroupMember,
  GroupPermissionLevel,
} from '../interfaces/group.repository.interface.js'
import { randomUUID } from 'node:crypto'

interface GroupRow {
  id: string
  name: string
  description: string
  owner_id: string
  type: 'private' | 'public'
  created_at: string
  updated_at: string
}

export class SQLiteGroupRepository implements IGroupRepository {
  constructor(private db: Database.Database) {}

  // ========== 辅助方法 ==========

  private async rowToGroupProfile(row: GroupRow): Promise<GroupProfile> {
    const memberCount = await this.countMembers(row.id)

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdBy: row.owner_id,
      isPublic: row.type === 'public',
      memberCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // ========== 创建 ==========

  async create(data: CreateGroupDTO): Promise<GroupProfile> {
    const groupId = randomUUID()
    const memberId = randomUUID()
    const isPublic = data.isPublic ?? false

    // 创建群组
    this.db
      .prepare(
        `INSERT INTO groups (id, name, description, owner_id, type)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        groupId,
        data.name,
        data.description ?? '',
        data.createdBy,
        isPublic ? 'public' : 'private',
      )

    // 将创建者添加为群主
    this.db
      .prepare(
        `INSERT INTO group_members (id, group_id, claw_id, role)
         VALUES (?, ?, ?, 'owner')`,
      )
      .run(memberId, groupId, data.createdBy)

    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .get(groupId) as GroupRow

    return this.rowToGroupProfile(row)
  }

  // ========== 查询 ==========

  async findById(groupId: string): Promise<GroupProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .get(groupId) as GroupRow | undefined

    if (!row) return null

    return this.rowToGroupProfile(row)
  }

  async findByMember(clawId: string): Promise<GroupProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT g.* FROM groups g
         JOIN group_members gm ON g.id = gm.group_id
         WHERE gm.claw_id = ?
         ORDER BY g.updated_at DESC`,
      )
      .all(clawId) as GroupRow[]

    return Promise.all(rows.map((row) => this.rowToGroupProfile(row)))
  }

  async findPublicGroups(options?: {
    limit?: number
    offset?: number
  }): Promise<GroupProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM groups
         WHERE type = 'public'
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as GroupRow[]

    return Promise.all(rows.map((row) => this.rowToGroupProfile(row)))
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const rows = this.db
      .prepare(
        `SELECT c.claw_id, c.display_name, c.avatar_url, gm.role as permission, gm.joined_at
         FROM group_members gm
         JOIN claws c ON gm.claw_id = c.claw_id
         WHERE gm.group_id = ?
         ORDER BY gm.joined_at ASC`,
      )
      .all(groupId) as Array<{
      claw_id: string
      display_name: string
      avatar_url: string | null
      permission: GroupPermissionLevel
      joined_at: string
    }>

    return rows.map((row) => ({
      clawId: row.claw_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? undefined,
      permission: row.permission,
      joinedAt: row.joined_at,
    }))
  }

  async getMemberPermission(
    groupId: string,
    clawId: string,
  ): Promise<GroupPermissionLevel | null> {
    const row = this.db
      .prepare(
        `SELECT role FROM group_members
         WHERE group_id = ? AND claw_id = ?`,
      )
      .get(groupId, clawId) as { role: GroupPermissionLevel } | undefined

    return row ? row.role : null
  }

  // ========== 更新 ==========

  async update(groupId: string, data: UpdateGroupDTO): Promise<GroupProfile | null> {
    const fields: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      values.push(data.name)
    }
    if (data.description !== undefined) {
      fields.push('description = ?')
      values.push(data.description)
    }
    if (data.isPublic !== undefined) {
      fields.push('type = ?')
      values.push(data.isPublic ? 'public' : 'private')
    }

    if (fields.length === 0) {
      return this.findById(groupId)
    }

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    values.push(groupId)

    const result = this.db
      .prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values)

    if (result.changes === 0) {
      return null
    }

    return this.findById(groupId)
  }

  async addMember(
    groupId: string,
    clawId: string,
    permission?: GroupPermissionLevel,
  ): Promise<void> {
    const memberId = randomUUID()
    const role = permission ?? 'member'

    this.db
      .prepare(
        `INSERT INTO group_members (id, group_id, claw_id, role)
         VALUES (?, ?, ?, ?)`,
      )
      .run(memberId, groupId, clawId, role)
  }

  async removeMember(groupId: string, clawId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND claw_id = ?')
      .run(groupId, clawId)
  }

  async updateMemberPermission(
    groupId: string,
    clawId: string,
    permission: GroupPermissionLevel,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE group_members
         SET role = ?
         WHERE group_id = ? AND claw_id = ?`,
      )
      .run(permission, groupId, clawId)
  }

  // ========== 删除 ==========

  async delete(groupId: string): Promise<void> {
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(groupId)
  }

  // ========== 统计 ==========

  async isMember(groupId: string, clawId: string): Promise<boolean> {
    const result = this.db
      .prepare(
        `SELECT 1 FROM group_members
         WHERE group_id = ? AND claw_id = ?
         LIMIT 1`,
      )
      .get(groupId, clawId)

    return result !== undefined
  }

  async countMembers(groupId: string): Promise<number> {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?')
      .get(groupId) as { count: number }

    return result.count
  }

  async exists(groupId: string): Promise<boolean> {
    const result = this.db
      .prepare('SELECT 1 FROM groups WHERE id = ? LIMIT 1')
      .get(groupId)

    return result !== undefined
  }
}
