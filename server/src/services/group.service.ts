import { randomUUID } from 'node:crypto'
import type { Block } from '../schemas/blocks.js'
import type { EventBus } from './event-bus.js'
import type { InboxEntry } from './inbox.service.js'
import type {
  IGroupDataAccess,
  GroupRow,
  GroupMemberRow,
  GroupInvitationRow,
} from '../db/repositories/interfaces/group-data-access.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import { config } from '../config/env.js'

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
    private dataAccess: IGroupDataAccess,
    private eventBus?: EventBus,
    private cache?: ICacheService,
  ) {}

  // === Group CRUD ===

  async createGroup(clawId: string, input: CreateGroupInput): Promise<GroupProfile> {
    const id = randomUUID()

    await this.dataAccess.insertGroup({
      id,
      name: input.name,
      description: input.description || '',
      owner_id: clawId,
      type: input.type || 'private',
      max_members: input.maxMembers || 100,
      encrypted: input.encrypted ?? false,
    })

    // Add owner as first member
    await this.dataAccess.insertGroupMember({
      id: randomUUID(),
      group_id: id,
      claw_id: clawId,
      role: 'owner',
    })

    return (await this.findById(id))!
  }

  async findById(groupId: string): Promise<GroupProfile | null> {
    const cacheKey = `group:${groupId}`
    if (this.cache) {
      const cached = await this.cache.get<GroupProfile>(cacheKey)
      if (cached) return cached
    }

    const row = await this.dataAccess.findGroupById(groupId)
    if (!row) return null

    const memberCount = await this.dataAccess.countGroupMembers(groupId)
    const profile = groupRowToProfile(row, memberCount)

    if (this.cache) {
      await this.cache.set(cacheKey, profile, config.cacheTtlGroup)
    }
    return profile
  }

  async listByClawId(clawId: string): Promise<GroupProfile[]> {
    const rows = await this.dataAccess.findGroupsByMemberId(clawId)

    const results = await Promise.all(
      rows.map(async (row) => {
        const memberCount = await this.dataAccess.countGroupMembers(row.id)
        return groupRowToProfile(row, memberCount)
      }),
    )
    return results
  }

  async updateGroup(groupId: string, clawId: string, input: UpdateGroupInput): Promise<GroupProfile> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    await this.requireRole(groupId, clawId, ['owner', 'admin'])

    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name
    if (input.description !== undefined) updates.description = input.description
    if (input.type !== undefined) updates.type = input.type
    if (input.maxMembers !== undefined) updates.max_members = input.maxMembers
    if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl

    if (Object.keys(updates).length === 0) return group

    await this.dataAccess.updateGroup(groupId, updates as any)
    await this.invalidateGroupCache(groupId)

    return (await this.findById(groupId))!
  }

  async deleteGroup(groupId: string, clawId: string): Promise<void> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    await this.requireRole(groupId, clawId, ['owner'])

    await this.dataAccess.deleteGroup(groupId)
    await this.invalidateGroupCache(groupId)
  }

  // === Member Management ===

  async getMembers(groupId: string): Promise<GroupMemberProfile[]> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const members = await this.dataAccess.findGroupMembers(groupId)

    // Fetch display names for all members in parallel
    const profiles = await Promise.all(
      members.map(async (member) => {
        const displayName = await this.dataAccess.getClawDisplayName(member.claw_id)
        return {
          id: member.id,
          groupId: member.group_id,
          clawId: member.claw_id,
          displayName: displayName ?? '',
          role: member.role,
          joinedAt: member.joined_at,
          invitedBy: member.invited_by,
        } satisfies GroupMemberProfile
      }),
    )

    // Sort: owner first, then admin, then member
    profiles.sort((a, b) => {
      const roleOrder = { owner: 0, admin: 1, member: 2 }
      return (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2)
    })

    return profiles
  }

  async inviteMember(groupId: string, inviterId: string, inviteeId: string): Promise<GroupInvitationProfile> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    await this.requireRole(groupId, inviterId, ['owner', 'admin'])

    // Check if invitee exists
    const inviteeName = await this.dataAccess.getClawDisplayName(inviteeId)
    if (!inviteeName) throw new GroupError('INVITEE_NOT_FOUND', 'Invitee not found')

    // Check if already a member
    const existing = await this.dataAccess.findGroupMember(groupId, inviteeId)
    if (existing) throw new GroupError('ALREADY_MEMBER', 'Already a member')

    // Check member limit
    if (group.memberCount >= group.maxMembers) {
      throw new GroupError('GROUP_FULL', 'Group has reached maximum member limit')
    }

    // Check for existing pending invitation
    const pendingInv = await this.dataAccess.findPendingGroupInvitation(groupId, inviteeId)
    if (pendingInv) throw new GroupError('ALREADY_INVITED', 'Already has a pending invitation')

    const id = randomUUID()
    await this.dataAccess.insertGroupInvitation({
      id,
      group_id: groupId,
      inviter_id: inviterId,
      invitee_id: inviteeId,
    })

    if (this.eventBus) {
      this.eventBus.emit('group.invited', {
        recipientId: inviteeId,
        groupId,
        groupName: group.name,
        inviterId,
      })
    }

    return (await this.getInvitationById(id))!
  }

  async acceptInvitation(groupId: string, clawId: string): Promise<GroupMemberProfile> {
    const invitation = await this.dataAccess.findPendingGroupInvitation(groupId, clawId)

    const group = await this.findById(groupId)
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
    const existing = await this.dataAccess.findGroupMember(groupId, clawId)
    if (existing) throw new GroupError('ALREADY_MEMBER', 'Already a member')

    const memberId = randomUUID()
    await this.dataAccess.insertGroupMember({
      id: memberId,
      group_id: groupId,
      claw_id: clawId,
      role: 'member',
      invited_by: invitation?.inviter_id ?? null,
    })

    if (invitation) {
      await this.dataAccess.acceptGroupInvitation(invitation.id)
    }

    await this.invalidateGroupCache(groupId)

    if (this.eventBus) {
      // Notify all existing members
      const memberIds = await this.dataAccess.findGroupMemberIds(groupId)
      for (const mid of memberIds) {
        if (mid !== clawId) {
          this.eventBus.emit('group.joined', {
            recipientId: mid,
            groupId,
            clawId,
          })
        }
      }
      await this.notifyKeyRotation(groupId, 'member_joined')
    }

    const memberRow = await this.dataAccess.findGroupMemberById(memberId)
    const displayName = await this.dataAccess.getClawDisplayName(clawId)

    return {
      id: memberRow!.id,
      groupId: memberRow!.group_id,
      clawId: memberRow!.claw_id,
      displayName: displayName ?? '',
      role: memberRow!.role,
      joinedAt: memberRow!.joined_at,
      invitedBy: memberRow!.invited_by,
    }
  }

  async leaveGroup(groupId: string, clawId: string): Promise<void> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = await this.dataAccess.findGroupMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    if (member.role === 'owner') {
      throw new GroupError('OWNER_CANNOT_LEAVE', 'Owner cannot leave; transfer ownership or delete the group')
    }

    await this.dataAccess.deleteGroupMember(groupId, clawId)
    await this.invalidateGroupCache(groupId)

    if (this.eventBus) {
      const memberIds = await this.dataAccess.findGroupMemberIds(groupId)
      for (const mid of memberIds) {
        this.eventBus.emit('group.left', {
          recipientId: mid,
          groupId,
          clawId,
        })
      }
      await this.notifyKeyRotation(groupId, 'member_left')
    }
  }

  async removeMember(groupId: string, actorId: string, targetId: string): Promise<void> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    await this.requireRole(groupId, actorId, ['owner', 'admin'])

    const target = await this.dataAccess.findGroupMember(groupId, targetId)
    if (!target) throw new GroupError('NOT_MEMBER', 'Target is not a group member')

    // Admin can't remove owner or other admins
    const actor = await this.dataAccess.findGroupMember(groupId, actorId)
    if (actor!.role === 'admin' && (target.role === 'owner' || target.role === 'admin')) {
      throw new GroupError('INSUFFICIENT_PERMISSIONS', 'Admin cannot remove owner or other admins')
    }

    await this.dataAccess.deleteGroupMember(groupId, targetId)
    await this.invalidateGroupCache(groupId)

    if (this.eventBus) {
      this.eventBus.emit('group.removed', {
        recipientId: targetId,
        groupId,
        removedBy: actorId,
      })
      await this.notifyKeyRotation(groupId, 'member_removed')
    }
  }

  async updateMemberRole(
    groupId: string,
    ownerId: string,
    targetId: string,
    role: 'admin' | 'member',
  ): Promise<GroupMemberProfile> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    await this.requireRole(groupId, ownerId, ['owner'])

    const target = await this.dataAccess.findGroupMember(groupId, targetId)
    if (!target) throw new GroupError('NOT_MEMBER', 'Target is not a group member')

    if (target.role === 'owner') {
      throw new GroupError('CANNOT_CHANGE_OWNER', 'Cannot change owner role via this endpoint')
    }

    await this.dataAccess.updateGroupMemberRole(groupId, targetId, role)

    const updatedRow = await this.dataAccess.findGroupMember(groupId, targetId)
    const displayName = await this.dataAccess.getClawDisplayName(targetId)

    return {
      id: updatedRow!.id,
      groupId: updatedRow!.group_id,
      clawId: updatedRow!.claw_id,
      displayName: displayName ?? '',
      role: updatedRow!.role,
      joinedAt: updatedRow!.joined_at,
      invitedBy: updatedRow!.invited_by,
    }
  }

  // === Group Messages ===

  async sendMessage(
    groupId: string,
    fromClawId: string,
    blocks: Block[],
    contentWarning?: string,
    replyTo?: string,
  ): Promise<{ message: GroupMessageProfile; recipientCount: number }> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = await this.dataAccess.findGroupMember(groupId, fromClawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    // Resolve thread
    let replyToId: string | null = null
    let threadId: string | null = null

    if (replyTo) {
      const parent = await this.dataAccess.findGroupMessageById(replyTo)
      if (!parent || parent.group_id !== groupId) {
        throw new GroupError('NOT_FOUND', 'Reply-to message not found in this group')
      }
      replyToId = parent.id
      threadId = parent.thread_id || parent.id
    }

    // Create message
    const msgId = generateTimeOrderedId()
    const blocksJson = JSON.stringify(blocks)

    await this.dataAccess.insertGroupMessage({
      id: msgId,
      from_claw_id: fromClawId,
      group_id: groupId,
      blocks_json: blocksJson,
      content_warning: contentWarning ?? null,
      reply_to_id: replyToId,
      thread_id: threadId,
    })

    // Fan out to all members except sender
    const allMemberIds = await this.dataAccess.findGroupMemberIds(groupId)
    const recipientIds = allMemberIds.filter((id) => id !== fromClawId)

    for (const recipientId of recipientIds) {
      const seq = await this.dataAccess.incrementSeqCounter(recipientId)
      await this.dataAccess.insertInboxEntry({
        id: randomUUID(),
        recipient_id: recipientId,
        message_id: msgId,
        seq,
      })
    }

    // Get sender display name
    const senderName = await this.dataAccess.getClawDisplayName(fromClawId)

    const message: GroupMessageProfile = {
      id: msgId,
      fromClawId,
      fromDisplayName: senderName ?? '',
      groupId,
      blocks,
      contentWarning: contentWarning || null,
      replyToId,
      threadId,
      createdAt: new Date().toISOString(),
    }

    // Emit events
    if (this.eventBus) {
      for (const recipientId of recipientIds) {
        const inboxRow = await this.dataAccess.findInboxEntry(recipientId, msgId)
        if (inboxRow) {
          const entry: InboxEntry = {
            id: inboxRow.id,
            seq: inboxRow.seq,
            status: inboxRow.status,
            message: {
              id: inboxRow.message_id,
              fromClawId: inboxRow.from_claw_id,
              fromDisplayName: inboxRow.display_name,
              blocks: typeof inboxRow.blocks_json === 'string' ? JSON.parse(inboxRow.blocks_json) : inboxRow.blocks_json,
              visibility: inboxRow.visibility,
              contentWarning: inboxRow.content_warning,
              createdAt: inboxRow.msg_created_at,
            },
            createdAt: inboxRow.created_at,
          }
          this.eventBus.emit('message.new', { recipientId, entry })
        }
      }
    }

    return {
      message,
      recipientCount: recipientIds.length,
    }
  }

  async getGroupMessages(
    groupId: string,
    clawId: string,
    limit = 50,
    beforeId?: string,
  ): Promise<GroupMessageProfile[]> {
    const group = await this.findById(groupId)
    if (!group) throw new GroupError('NOT_FOUND', 'Group not found')

    const member = await this.dataAccess.findGroupMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')

    const cappedLimit = Math.min(limit, 100)

    // Use data access layer for message retrieval
    const rows = await this.dataAccess.findGroupMessages(groupId, cappedLimit)

    // Filter by beforeId if specified (compare string IDs)
    let filteredRows = rows
    if (beforeId) {
      filteredRows = rows.filter((row) => row.id < beforeId)
    }

    // Fetch display names in parallel and convert
    const results = await Promise.all(
      filteredRows.map(async (row) => {
        const displayName = await this.dataAccess.getClawDisplayName(row.from_claw_id)
        return {
          id: row.id,
          fromClawId: row.from_claw_id,
          fromDisplayName: displayName ?? '',
          groupId: row.group_id,
          blocks: typeof row.blocks_json === 'string' ? JSON.parse(row.blocks_json) : row.blocks_json,
          contentWarning: row.content_warning,
          replyToId: row.reply_to_id,
          threadId: row.thread_id,
          createdAt: row.created_at,
        } satisfies GroupMessageProfile
      }),
    )

    return results
  }

  // === Invitations ===

  async getPendingInvitations(clawId: string): Promise<GroupInvitationProfile[]> {
    const invitations = await this.dataAccess.findPendingGroupInvitations(clawId)

    const results = await Promise.all(
      invitations.map(async (inv) => {
        const [groupName, inviterName] = await Promise.all([
          this.dataAccess.getGroupName(inv.group_id),
          this.dataAccess.getClawDisplayName(inv.inviter_id),
        ])
        return {
          id: inv.id,
          groupId: inv.group_id,
          groupName: groupName ?? '',
          inviterId: inv.inviter_id,
          inviterName: inviterName ?? '',
          inviteeId: inv.invitee_id,
          status: inv.status,
          createdAt: inv.created_at,
          respondedAt: inv.responded_at,
        } satisfies GroupInvitationProfile
      }),
    )

    return results
  }

  async rejectInvitation(groupId: string, clawId: string): Promise<void> {
    const invitation = await this.dataAccess.findPendingGroupInvitation(groupId, clawId)
    if (!invitation) {
      throw new GroupError('NO_INVITATION', 'No pending invitation found')
    }

    await this.dataAccess.rejectGroupInvitation(invitation.id)
  }

  // === Key Rotation Notifications ===

  private async notifyKeyRotation(groupId: string, reason: string): Promise<void> {
    if (!this.eventBus) return

    const group = await this.findById(groupId)
    if (!group || !group.encrypted) return

    const memberIds = await this.dataAccess.findGroupMemberIds(groupId)
    for (const memberId of memberIds) {
      this.eventBus.emit('group.key_rotation_needed', {
        recipientId: memberId,
        groupId,
        reason,
      })
    }
  }

  // === Cache ===

  private async invalidateGroupCache(groupId: string): Promise<void> {
    if (!this.cache) return
    await this.cache.del(`group:${groupId}`)
  }

  // === Helpers ===

  async isMember(groupId: string, clawId: string): Promise<boolean> {
    const member = await this.dataAccess.findGroupMember(groupId, clawId)
    return !!member
  }

  async getMemberIds(groupId: string): Promise<string[]> {
    return await this.dataAccess.findGroupMemberIds(groupId)
  }

  private async requireRole(groupId: string, clawId: string, roles: string[]): Promise<void> {
    const member = await this.dataAccess.findGroupMember(groupId, clawId)
    if (!member) throw new GroupError('NOT_MEMBER', 'Not a group member')
    if (!roles.includes(member.role)) {
      throw new GroupError('INSUFFICIENT_PERMISSIONS', `Requires role: ${roles.join(' or ')}`)
    }
  }

  private async getInvitationById(id: string): Promise<GroupInvitationProfile | null> {
    const inv = await this.dataAccess.findGroupInvitationById(id)
    if (!inv) return null

    const groupName = await this.dataAccess.getGroupName(inv.group_id)
    const inviterName = await this.dataAccess.getClawDisplayName(inv.inviter_id)

    return {
      id: inv.id,
      groupId: inv.group_id,
      groupName: groupName ?? '',
      inviterId: inv.inviter_id,
      inviterName: inviterName ?? '',
      inviteeId: inv.invitee_id,
      status: inv.status,
      createdAt: inv.created_at,
      respondedAt: inv.responded_at,
    }
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

export class GroupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'GroupError'
  }
}
