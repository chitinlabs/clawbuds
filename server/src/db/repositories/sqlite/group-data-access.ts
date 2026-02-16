/**
 * SQLite Group Data Access Implementation
 * GroupService 的数据访问层实现
 */

import type Database from 'better-sqlite3'
import type {
  IGroupDataAccess,
  GroupRow,
  GroupMemberRow,
  GroupInvitationRow,
  GroupMessageRow,
} from '../interfaces/group-data-access.interface.js'

export class SQLiteGroupDataAccess implements IGroupDataAccess {
  constructor(private db: Database.Database) {}

  getDatabase(): Database.Database {
    return this.db
  }

  // ========== 群组表操作 ==========

  findGroupById(groupId: string): GroupRow | null {
    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .get(groupId) as GroupRow | undefined
    return row || null
  }

  findGroupsByMemberId(clawId: string): GroupRow[] {
    return this.db
      .prepare(
        `SELECT g.* FROM groups g
         JOIN group_members gm ON g.id = gm.group_id
         WHERE gm.claw_id = ?
         ORDER BY g.created_at DESC`,
      )
      .all(clawId) as GroupRow[]
  }

  insertGroup(data: {
    id: string
    name: string
    description: string
    owner_id: string
    type: 'private' | 'public'
    max_members: number
    encrypted: boolean
  }): void {
    this.db
      .prepare(
        `INSERT INTO groups (id, name, description, owner_id, type, max_members, encrypted)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.name,
        data.description,
        data.owner_id,
        data.type,
        data.max_members,
        data.encrypted ? 1 : 0,
      )
  }

  updateGroup(
    groupId: string,
    updates: {
      name?: string
      description?: string
      type?: 'private' | 'public'
      max_members?: number
      avatar_url?: string | null
    },
  ): void {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.type !== undefined) {
      fields.push('type = ?')
      values.push(updates.type)
    }
    if (updates.max_members !== undefined) {
      fields.push('max_members = ?')
      values.push(updates.max_members)
    }
    if (updates.avatar_url !== undefined) {
      fields.push('avatar_url = ?')
      values.push(updates.avatar_url)
    }

    if (fields.length === 0) return

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    values.push(groupId)

    this.db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteGroup(groupId: string): void {
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(groupId)
  }

  countGroupMembers(groupId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?')
      .get(groupId) as { count: number }
    return result.count
  }

  // ========== 成员表操作 ==========

  findGroupMemberById(memberId: string): GroupMemberRow | null {
    const row = this.db
      .prepare('SELECT * FROM group_members WHERE id = ?')
      .get(memberId) as GroupMemberRow | undefined
    return row || null
  }

  findGroupMember(groupId: string, clawId: string): GroupMemberRow | null {
    const row = this.db
      .prepare('SELECT * FROM group_members WHERE group_id = ? AND claw_id = ?')
      .get(groupId, clawId) as GroupMemberRow | undefined
    return row || null
  }

  findGroupMembers(groupId: string): GroupMemberRow[] {
    return this.db
      .prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at ASC')
      .all(groupId) as GroupMemberRow[]
  }

  findGroupMemberIds(groupId: string): string[] {
    const rows = this.db
      .prepare('SELECT claw_id FROM group_members WHERE group_id = ?')
      .all(groupId) as { claw_id: string }[]
    return rows.map((r) => r.claw_id)
  }

  insertGroupMember(data: {
    id: string
    group_id: string
    claw_id: string
    role: 'owner' | 'admin' | 'member'
    invited_by?: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO group_members (id, group_id, claw_id, role, invited_by)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(data.id, data.group_id, data.claw_id, data.role, data.invited_by ?? null)
  }

  updateGroupMemberRole(groupId: string, clawId: string, role: 'admin' | 'member'): void {
    this.db
      .prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND claw_id = ?')
      .run(role, groupId, clawId)
  }

  deleteGroupMember(groupId: string, clawId: string): void {
    this.db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND claw_id = ?')
      .run(groupId, clawId)
  }

  // ========== 邀请表操作 ==========

  findGroupInvitationById(invitationId: string): GroupInvitationRow | null {
    const row = this.db
      .prepare('SELECT * FROM group_invitations WHERE id = ?')
      .get(invitationId) as GroupInvitationRow | undefined
    return row || null
  }

  findPendingGroupInvitation(groupId: string, inviteeId: string): GroupInvitationRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM group_invitations
         WHERE group_id = ? AND invitee_id = ? AND status = 'pending'`,
      )
      .get(groupId, inviteeId) as GroupInvitationRow | undefined
    return row || null
  }

  findPendingGroupInvitations(clawId: string): GroupInvitationRow[] {
    return this.db
      .prepare(
        `SELECT * FROM group_invitations
         WHERE invitee_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
      )
      .all(clawId) as GroupInvitationRow[]
  }

  insertGroupInvitation(data: {
    id: string
    group_id: string
    inviter_id: string
    invitee_id: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO group_invitations (id, group_id, inviter_id, invitee_id, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      )
      .run(data.id, data.group_id, data.inviter_id, data.invitee_id)
  }

  acceptGroupInvitation(invitationId: string): void {
    this.db
      .prepare(
        `UPDATE group_invitations
         SET status = 'accepted', responded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(invitationId)
  }

  rejectGroupInvitation(invitationId: string): void {
    this.db
      .prepare(
        `UPDATE group_invitations
         SET status = 'rejected', responded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(invitationId)
  }

  // ========== 群组消息表操作 ==========

  findGroupMessageById(messageId: string): GroupMessageRow | null {
    const row = this.db
      .prepare('SELECT * FROM group_messages WHERE id = ?')
      .get(messageId) as GroupMessageRow | undefined
    return row || null
  }

  findGroupMessages(groupId: string, limit: number, afterSeq?: number): GroupMessageRow[] {
    if (afterSeq !== undefined) {
      // TODO: 需要实现基于 seq 的查询
      return this.db
        .prepare(
          `SELECT * FROM group_messages
           WHERE group_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(groupId, limit) as GroupMessageRow[]
    } else {
      return this.db
        .prepare(
          `SELECT * FROM group_messages
           WHERE group_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(groupId, limit) as GroupMessageRow[]
    }
  }

  insertGroupMessage(data: {
    id: string
    from_claw_id: string
    group_id: string
    blocks_json: string
    content_warning?: string | null
    reply_to_id?: string | null
    thread_id?: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO group_messages (id, from_claw_id, group_id, blocks_json, content_warning, reply_to_id, thread_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.from_claw_id,
        data.group_id,
        data.blocks_json,
        data.content_warning ?? null,
        data.reply_to_id ?? null,
        data.thread_id ?? null,
      )
  }

  deleteGroupMessage(messageId: string): void {
    this.db.prepare('DELETE FROM group_messages WHERE id = ?').run(messageId)
  }

  // ========== 收件箱操作 ==========

  insertInboxEntry(data: {
    id: string
    recipient_id: string
    message_id: string
    seq: number
  }): void {
    this.db
      .prepare(
        `INSERT INTO inbox_entries (id, recipient_id, message_id, seq)
         VALUES (?, ?, ?, ?)`,
      )
      .run(data.id, data.recipient_id, data.message_id, data.seq)
  }

  findInboxEntry(
    recipientId: string,
    messageId: string,
  ): {
    id: string
    seq: number
    status: string
    created_at: string
    message_id: string
    from_claw_id: string
    blocks_json: string
    visibility: string
    content_warning: string | null
    msg_created_at: string
    display_name: string
  } | null {
    const row = this.db
      .prepare(
        `SELECT
          ie.id, ie.seq, ie.status, ie.created_at,
          m.id AS message_id, m.from_claw_id, m.blocks_json,
          m.visibility, m.content_warning, m.created_at AS msg_created_at,
          c.display_name
        FROM inbox_entries ie
        JOIN messages m ON m.id = ie.message_id
        JOIN claws c ON c.claw_id = m.from_claw_id
        WHERE ie.recipient_id = ? AND ie.message_id = ?`,
      )
      .get(recipientId, messageId) as
      | {
          id: string
          seq: number
          status: string
          created_at: string
          message_id: string
          from_claw_id: string
          blocks_json: string
          visibility: string
          content_warning: string | null
          msg_created_at: string
          display_name: string
        }
      | undefined

    return row || null
  }

  // ========== 序列号计数器 ==========

  incrementSeqCounter(clawId: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO seq_counters (claw_id, seq) VALUES (?, 1)
         ON CONFLICT(claw_id) DO UPDATE SET seq = seq + 1
         RETURNING seq`,
      )
      .get(clawId) as { seq: number }
    return row.seq
  }

  // ========== 辅助查询 ==========

  getClawDisplayName(clawId: string): string | null {
    const row = this.db
      .prepare('SELECT display_name FROM claws WHERE claw_id = ?')
      .get(clawId) as { display_name: string } | undefined
    return row?.display_name || null
  }

  getGroupName(groupId: string): string | null {
    const row = this.db
      .prepare('SELECT name FROM groups WHERE id = ?')
      .get(groupId) as { name: string } | undefined
    return row?.name || null
  }
}
