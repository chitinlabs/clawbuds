import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Block } from '@clawbuds/shared'
import type { EventBus } from './event-bus.js'
import type { InboxEntry } from './inbox.service.js'

// Row types
interface GroupRow {
  id: string
  name: string
  description: string
  owner_id: string
  type: 'private' | 'public'
  max_members: number
  encrypted: number
  avatar_url: string | null
  created_at: string
  updated_at: string
}

interface GroupMemberRow {
  id: string
  group_id: string
  claw_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  invited_by: string | null
}

interface GroupInvitationRow {
  id: string
  group_id: string
  inviter_id: string
  invitee_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  responded_at: string | null
}

// Profile types
export interface GroupProfile {
  id: string
  name: string
  description: string
  ownerId: string
  type: 'private' | 'public'
  maxMembers: number
  encrypted: boolean
  avatarUrl: string | null
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface GroupMemberProfile {
  id: string
  groupId: string
  clawId: string
  displayName: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  invitedBy: string | null
}

export interface GroupInvitationProfile {
  id: string
  groupId: string
  groupName: string
  inviterId: string
  inviterName: string
  inviteeId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  respondedAt: string | null
}

export interface CreateGroupInput {
  name: string
  description?: string
  type?: 'private' | 'public'
  maxMembers?: number
  encrypted?: boolean
}

export interface UpdateGroupInput {
  name?: string
  description?: string
  type?: 'private' | 'public'
  maxMembers?: number
  avatarUrl?: string | null
}

export interface GroupMessageProfile {
  id: string
  fromClawId: string
  fromDisplayName: string
  groupId: string
  blocks: Block[]
  contentWarning: string | null
  replyToId: string | null
  threadId: string | null
  createdAt: string
}

export class GroupService {
  constructor(
    private db: Database.Database,
    private eventBus?: EventBus,
  ) {}

  // === Group CRUD ===

  createGroup(clawId: string, input: CreateGroupInput): GroupProfile {
    const id = `grp_${randomUUID()}`

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO groups (id, name, description, owner_id, type, max_members, encrypted)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.name,
          input.description || '',
          clawId,
          input.type || 'private',
          input.maxMembers || 100,
          input.encrypted ? 1 : 0,
        )

      // Add owner as first member
      this.db
        .prepare(
          `INSERT INTO group_members (id, group_id, claw_id, role)
           VALUES (?, ?, ?, 'owner')`,
        )
        .run(randomUUID(), id, clawId)
    })()

    return this.findById(id)!
  }

  findById(groupId: string): GroupProfile | null {
    const row = this.db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .get(groupId) as GroupRow | undefined
    if (!row) return null

    const memberCount = (
      this.db
        .prepare('SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?')
        .get(groupId) as { count: number }
    ).count

    return groupRowToProfile(row, memberCount)
  }

  listByClawId(clawId: string): GroupProfile[] {
    const rows = this.db
      .prepare(
        `SELECT g.* FROM groups g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.claw_id = ?
         ORDER BY g.updated_at DESC`,
      )
      .all(clawId) as GroupRow[]

    return rows.map((row) => {
      const memberCount = (
        this.db
          .prepare('SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?')
          .get(row.id) as { count: number }
      ).count
      return groupRowToProfile(row, memberCount)
    })
  }

  updateGroup(groupId: string, clawId: string, input: UpdateGroupInput): GroupProfile {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    this.requireRole(groupId, clawId, ['owner', 'admin'])

    const updates: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      updates.push('name = ?')
      values.push(input.name)
    }
    if (input.description !== undefined) {
      updates.push('description = ?')
      values.push(input.description)
    }
    if (input.type !== undefined) {
      updates.push('type = ?')
      values.push(input.type)
    }
    if (input.maxMembers !== undefined) {
      updates.push('max_members = ?')
      values.push(input.maxMembers)
    }
    if (input.avatarUrl !== undefined) {
      updates.push('avatar_url = ?')
      values.push(input.avatarUrl)
    }

    if (updates.length === 0) return group

    updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    values.push(groupId)

    this.db
      .prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)

    return this.findById(groupId)!
  }

  deleteGroup(groupId: string, clawId: string): void {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    this.requireRole(groupId, clawId, ['owner'])

    this.db.prepare('DELETE FROM groups WHERE id = ?').run(groupId)
  }

  // === Member Management ===

  getMembers(groupId: string): GroupMemberProfile[] {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const rows = this.db
      .prepare(
        `SELECT gm.*, c.display_name
         FROM group_members gm
         JOIN claws c ON c.claw_id = gm.claw_id
         WHERE gm.group_id = ?
         ORDER BY
           CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
           gm.joined_at ASC`,
      )
      .all(groupId) as (GroupMemberRow & { display_name: string })[]

    return rows.map(memberRowToProfile)
  }

  inviteMember(groupId: string, inviterId: string, inviteeId: string): GroupInvitationProfile {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    this.requireRole(groupId, inviterId, ['owner', 'admin'])

    // Check if invitee exists
    const invitee = this.db
      .prepare('SELECT claw_id FROM claws WHERE claw_id = ?')
      .get(inviteeId)
    if (!invitee) throw new GroupError('INVITEE_NOT_FOUND', 'Invitee not found')

    // Check if already a member
    const existing = this.db
      .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND claw_id = ?')
      .get(groupId, inviteeId)
    if (existing) throw new GroupError('ALREADY_MEMBER', 'Already a member')

    // Check member limit
    if (group.memberCount >= group.maxMembers) {
      throw new GroupError('GROUP_FULL', 'Group has reached maximum member limit')
    }

    // Check for existing pending invitation
    const pendingInv = this.db
      .prepare(
        "SELECT 1 FROM group_invitations WHERE group_id = ? AND invitee_id = ? AND status = 'pending'",
      )
      .get(groupId, inviteeId)
    if (pendingInv) throw new GroupError('ALREADY_INVITED', 'Already has a pending invitation')

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO group_invitations (id, group_id, inviter_id, invitee_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, groupId, inviterId, inviteeId)

    if (this.eventBus) {
      this.eventBus.emit('group.invited', {
        recipientId: inviteeId,
        groupId,
        groupName: group.name,
        inviterId,
      })
    }

    return this.getInvitationById(id)!
  }

  acceptInvitation(groupId: string, clawId: string): GroupMemberProfile {
    const invitation = this.db
      .prepare(
        "SELECT * FROM group_invitations WHERE group_id = ? AND invitee_id = ? AND status = 'pending'",
      )
      .get(groupId, clawId) as GroupInvitationRow | undefined

    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    // Allow joining public groups without invitation
    if (!invitation && group.type !== 'public') {
      throw new GroupError('NO_INVITATION', 'No pending invitation found')
    }

    // Check member limit
    if (group.memberCount >= group.maxMembers) {
      throw new GroupError('GROUP_FULL', 'Group has reached maximum member limit')
    }

    // Check if already a member
    const existing = this.db
      .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND claw_id = ?')
      .get(groupId, clawId)
    if (existing) throw new GroupError('ALREADY_MEMBER', 'Already a member')

    const memberId = randomUUID()
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO group_members (id, group_id, claw_id, role, invited_by)
           VALUES (?, ?, ?, 'member', ?)`,
        )
        .run(memberId, groupId, clawId, invitation?.inviter_id || null)

      if (invitation) {
        this.db
          .prepare(
            "UPDATE group_invitations SET status = 'accepted', responded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
          )
          .run(invitation.id)
      }
    })()

    if (this.eventBus) {
      // Notify all existing members
      const members = this.getMemberIds(groupId)
      for (const memberId of members) {
        if (memberId !== clawId) {
          this.eventBus.emit('group.joined', {
            recipientId: memberId,
            groupId,
            clawId,
          })
        }
      }
      this.notifyKeyRotation(groupId, 'member_joined')
    }

    const memberRow = this.db
      .prepare(
        `SELECT gm.*, c.display_name
         FROM group_members gm
         JOIN claws c ON c.claw_id = gm.claw_id
         WHERE gm.id = ?`,
      )
      .get(memberId) as (GroupMemberRow & { display_name: string })

    return memberRowToProfile(memberRow)
  }

  leaveGroup(groupId: string, clawId: string): void {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = this.getMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    if (member.role === 'owner') {
      throw new GroupError('OWNER_CANNOT_LEAVE', 'Owner cannot leave; transfer ownership or delete the group')
    }

    this.db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND claw_id = ?')
      .run(groupId, clawId)

    if (this.eventBus) {
      const members = this.getMemberIds(groupId)
      for (const memberId of members) {
        this.eventBus.emit('group.left', {
          recipientId: memberId,
          groupId,
          clawId,
        })
      }
      this.notifyKeyRotation(groupId, 'member_left')
    }
  }

  removeMember(groupId: string, actorId: string, targetId: string): void {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    this.requireRole(groupId, actorId, ['owner', 'admin'])

    const target = this.getMember(groupId, targetId)
    if (!target) throw new GroupError('NOT_MEMBER', 'Target is not a group member')

    // Admin can't remove owner or other admins
    const actor = this.getMember(groupId, actorId)!
    if (actor.role === 'admin' && (target.role === 'owner' || target.role === 'admin')) {
      throw new GroupError('INSUFFICIENT_PERMISSIONS', 'Admin cannot remove owner or other admins')
    }

    this.db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND claw_id = ?')
      .run(groupId, targetId)

    if (this.eventBus) {
      this.eventBus.emit('group.removed', {
        recipientId: targetId,
        groupId,
        removedBy: actorId,
      })
      this.notifyKeyRotation(groupId, 'member_removed')
    }
  }

  updateMemberRole(groupId: string, ownerId: string, targetId: string, role: 'admin' | 'member'): GroupMemberProfile {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    this.requireRole(groupId, ownerId, ['owner'])

    const target = this.getMember(groupId, targetId)
    if (!target) throw new GroupError('NOT_MEMBER', 'Target is not a group member')

    if (target.role === 'owner') {
      throw new GroupError('CANNOT_CHANGE_OWNER', 'Cannot change owner role via this endpoint')
    }

    this.db
      .prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND claw_id = ?')
      .run(role, groupId, targetId)

    const updatedRow = this.db
      .prepare(
        `SELECT gm.*, c.display_name
         FROM group_members gm
         JOIN claws c ON c.claw_id = gm.claw_id
         WHERE gm.group_id = ? AND gm.claw_id = ?`,
      )
      .get(groupId, targetId) as (GroupMemberRow & { display_name: string })

    return memberRowToProfile(updatedRow)
  }

  // === Group Messages ===

  sendMessage(
    groupId: string,
    fromClawId: string,
    blocks: Block[],
    contentWarning?: string,
    replyTo?: string,
  ): { message: GroupMessageProfile; recipientCount: number } {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = this.getMember(groupId, fromClawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    const result = this.db.transaction(() => {
      // Resolve thread
      let replyToId: string | null = null
      let threadId: string | null = null

      if (replyTo) {
        const parent = this.db
          .prepare('SELECT id, thread_id, group_id FROM messages WHERE id = ?')
          .get(replyTo) as { id: string; thread_id: string | null; group_id: string | null } | undefined

        if (!parent || parent.group_id !== groupId) {
          throw new GroupError('NOT_FOUND', 'Reply-to message not found in this group')
        }
        replyToId = parent.id
        threadId = parent.thread_id || parent.id
      }

      // Create message
      const msgId = generateTimeOrderedId()
      const blocksJson = JSON.stringify(blocks)

      this.db
        .prepare(
          `INSERT INTO messages (id, from_claw_id, blocks_json, visibility, content_warning, reply_to_id, thread_id, group_id)
           VALUES (?, ?, ?, 'group', ?, ?, ?, ?)`,
        )
        .run(msgId, fromClawId, blocksJson, contentWarning || null, replyToId, threadId, groupId)

      // Fan out to all members except sender
      const memberIds = this.getMemberIds(groupId).filter((id) => id !== fromClawId)

      const insertInbox = this.db.prepare(
        'INSERT INTO inbox_entries (id, recipient_id, message_id, seq) VALUES (?, ?, ?, ?)',
      )

      for (const recipientId of memberIds) {
        const seq = this.nextSeq(recipientId)
        insertInbox.run(randomUUID(), recipientId, msgId, seq)
      }

      // Get sender display name
      const sender = this.db
        .prepare('SELECT display_name FROM claws WHERE claw_id = ?')
        .get(fromClawId) as { display_name: string }

      return {
        message: {
          id: msgId,
          fromClawId,
          fromDisplayName: sender.display_name,
          groupId,
          blocks,
          contentWarning: contentWarning || null,
          replyToId,
          threadId,
          createdAt: new Date().toISOString(),
        },
        recipientCount: memberIds.length,
        memberIds,
      }
    })()

    // Emit events after transaction
    if (this.eventBus) {
      for (const recipientId of result.memberIds) {
        const entry = this.getInboxEntryForRecipient(recipientId, result.message.id)
        if (entry) {
          this.eventBus.emit('message.new', { recipientId, entry })
        }
      }
    }

    return {
      message: result.message,
      recipientCount: result.recipientCount,
    }
  }

  getGroupMessages(
    groupId: string,
    clawId: string,
    limit = 50,
    beforeId?: string,
  ): GroupMessageProfile[] {
    const group = this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = this.getMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    let sql = `
      SELECT m.*, c.display_name
      FROM messages m
      JOIN claws c ON c.claw_id = m.from_claw_id
      WHERE m.group_id = ?
    `
    const params: unknown[] = [groupId]

    if (beforeId) {
      sql += ' AND m.id < ?'
      params.push(beforeId)
    }

    sql += ' ORDER BY m.created_at DESC LIMIT ?'
    params.push(Math.min(limit, 100))

    const rows = this.db.prepare(sql).all(...params) as (GroupRow & {
      id: string
      from_claw_id: string
      blocks_json: string
      content_warning: string | null
      reply_to_id: string | null
      thread_id: string | null
      group_id: string
      created_at: string
      display_name: string
    })[]

    return rows.map((row) => ({
      id: row.id,
      fromClawId: row.from_claw_id,
      fromDisplayName: row.display_name,
      groupId: row.group_id,
      blocks: JSON.parse(row.blocks_json) as Block[],
      contentWarning: row.content_warning,
      replyToId: row.reply_to_id,
      threadId: row.thread_id,
      createdAt: row.created_at,
    }))
  }

  // === Invitations ===

  getPendingInvitations(clawId: string): GroupInvitationProfile[] {
    const rows = this.db
      .prepare(
        `SELECT gi.*, g.name AS group_name, c.display_name AS inviter_name
         FROM group_invitations gi
         JOIN groups g ON g.id = gi.group_id
         JOIN claws c ON c.claw_id = gi.inviter_id
         WHERE gi.invitee_id = ? AND gi.status = 'pending'
         ORDER BY gi.created_at DESC`,
      )
      .all(clawId) as (GroupInvitationRow & { group_name: string; inviter_name: string })[]

    return rows.map(invitationRowToProfile)
  }

  rejectInvitation(groupId: string, clawId: string): void {
    const result = this.db
      .prepare(
        "UPDATE group_invitations SET status = 'rejected', responded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE group_id = ? AND invitee_id = ? AND status = 'pending'",
      )
      .run(groupId, clawId)

    if (result.changes === 0) {
      throw new GroupError('NO_INVITATION', 'No pending invitation found')
    }
  }

  // === Key Rotation Notifications ===

  private notifyKeyRotation(groupId: string, reason: string): void {
    if (!this.eventBus) return

    const group = this.findById(groupId)
    if (!group || !group.encrypted) return

    const memberIds = this.getMemberIds(groupId)
    for (const memberId of memberIds) {
      this.eventBus.emit('group.key_rotation_needed', {
        recipientId: memberId,
        groupId,
        reason,
      })
    }
  }

  // === Helpers ===

  isMember(groupId: string, clawId: string): boolean {
    return !!this.getMember(groupId, clawId)
  }

  private getMember(groupId: string, clawId: string): GroupMemberRow | null {
    const row = this.db
      .prepare('SELECT * FROM group_members WHERE group_id = ? AND claw_id = ?')
      .get(groupId, clawId) as GroupMemberRow | undefined
    return row || null
  }

  getMemberIds(groupId: string): string[] {
    const rows = this.db
      .prepare('SELECT claw_id FROM group_members WHERE group_id = ?')
      .all(groupId) as { claw_id: string }[]
    return rows.map((r) => r.claw_id)
  }

  private requireRole(groupId: string, clawId: string, roles: string[]): void {
    const member = this.getMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')
    if (!roles.includes(member.role)) {
      throw new GroupError('INSUFFICIENT_PERMISSIONS', `Requires role: ${roles.join(' or ')}`)
    }
  }

  private getInvitationById(id: string): GroupInvitationProfile | null {
    const row = this.db
      .prepare(
        `SELECT gi.*, g.name AS group_name, c.display_name AS inviter_name
         FROM group_invitations gi
         JOIN groups g ON g.id = gi.group_id
         JOIN claws c ON c.claw_id = gi.inviter_id
         WHERE gi.id = ?`,
      )
      .get(id) as (GroupInvitationRow & { group_name: string; inviter_name: string }) | undefined

    return row ? invitationRowToProfile(row) : null
  }

  private getInboxEntryForRecipient(recipientId: string, messageId: string): InboxEntry | null {
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

    if (!row) return null

    return {
      id: row.id,
      seq: row.seq,
      status: row.status,
      message: {
        id: row.message_id,
        fromClawId: row.from_claw_id,
        fromDisplayName: row.display_name,
        blocks: JSON.parse(row.blocks_json),
        visibility: row.visibility,
        contentWarning: row.content_warning,
        createdAt: row.msg_created_at,
      },
      createdAt: row.created_at,
    }
  }

  private nextSeq(clawId: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO seq_counters (claw_id, seq) VALUES (?, 1)
         ON CONFLICT(claw_id) DO UPDATE SET seq = seq + 1
         RETURNING seq`,
      )
      .get(clawId) as { seq: number }
    return row.seq
  }
}

function generateTimeOrderedId(): string {
  const timestamp = Date.now().toString(16).padStart(12, '0')
  const random = randomUUID().replace(/-/g, '').slice(0, 20)
  return `${timestamp}${random}`
}

function groupRowToProfile(row: GroupRow, memberCount: number): GroupProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    type: row.type,
    maxMembers: row.max_members,
    encrypted: Boolean(row.encrypted),
    avatarUrl: row.avatar_url,
    memberCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function memberRowToProfile(row: GroupMemberRow & { display_name: string }): GroupMemberProfile {
  return {
    id: row.id,
    groupId: row.group_id,
    clawId: row.claw_id,
    displayName: row.display_name,
    role: row.role,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
  }
}

function invitationRowToProfile(
  row: GroupInvitationRow & { group_name: string; inviter_name: string },
): GroupInvitationProfile {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    inviterId: row.inviter_id,
    inviterName: row.inviter_name,
    inviteeId: row.invitee_id,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  }
}

export class GroupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'GroupError'
  }
}
