/**
 * Group Data Access Interface
 * 为 GroupService 提供底层数据访问方法的轻量级接口
 *
 * 注意:这是一个数据访问层接口,不包含业务逻辑
 * GroupService 负责所有业务逻辑(权限检查、验证、事件发送等)
 */

import type { Block } from '../../../schemas/blocks.js'

// ========== Row 类型 (数据库原始记录) ==========

export interface GroupRow {
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

export interface GroupMemberRow {
  id: string
  group_id: string
  claw_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  invited_by: string | null
}

export interface GroupInvitationRow {
  id: string
  group_id: string
  inviter_id: string
  invitee_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  responded_at: string | null
}

export interface GroupMessageRow {
  id: string
  from_claw_id: string
  group_id: string
  blocks_json: string
  content_warning: string | null
  reply_to_id: string | null
  thread_id: string | null
  created_at: string
}

// ========== 数据访问接口 ==========

/**
 * 群组数据访问接口
 * 提供原始的数据库操作,不包含业务逻辑
 */
export interface IGroupDataAccess {
  // ========== 群组表操作 ==========

  findGroupById(groupId: string): Promise<GroupRow | null>
  findGroupsByMemberId(clawId: string): Promise<GroupRow[]>
  insertGroup(data: {
    id: string
    name: string
    description: string
    owner_id: string
    type: 'private' | 'public'
    max_members: number
    encrypted: boolean
  }): Promise<void>
  updateGroup(groupId: string, updates: {
    name?: string
    description?: string
    type?: 'private' | 'public'
    max_members?: number
    avatar_url?: string | null
  }): Promise<void>
  deleteGroup(groupId: string): Promise<void>
  countGroupMembers(groupId: string): Promise<number>

  // ========== 成员表操作 ==========

  findGroupMemberById(memberId: string): Promise<GroupMemberRow | null>
  findGroupMember(groupId: string, clawId: string): Promise<GroupMemberRow | null>
  findGroupMembers(groupId: string): Promise<GroupMemberRow[]>
  findGroupMemberIds(groupId: string): Promise<string[]>
  insertGroupMember(data: {
    id: string
    group_id: string
    claw_id: string
    role: 'owner' | 'admin' | 'member'
    invited_by?: string | null
  }): Promise<void>
  updateGroupMemberRole(groupId: string, clawId: string, role: 'admin' | 'member'): Promise<void>
  deleteGroupMember(groupId: string, clawId: string): Promise<void>

  // ========== 邀请表操作 ==========

  findGroupInvitationById(invitationId: string): Promise<GroupInvitationRow | null>
  findPendingGroupInvitation(groupId: string, inviteeId: string): Promise<GroupInvitationRow | null>
  findPendingGroupInvitations(clawId: string): Promise<GroupInvitationRow[]>
  insertGroupInvitation(data: {
    id: string
    group_id: string
    inviter_id: string
    invitee_id: string
  }): Promise<void>
  acceptGroupInvitation(invitationId: string): Promise<void>
  rejectGroupInvitation(invitationId: string): Promise<void>

  // ========== 群组消息表操作 ==========

  findGroupMessageById(messageId: string): Promise<GroupMessageRow | null>
  findGroupMessages(groupId: string, limit: number, afterSeq?: number): Promise<GroupMessageRow[]>
  insertGroupMessage(data: {
    id: string
    from_claw_id: string
    group_id: string
    blocks_json: string
    content_warning?: string | null
    reply_to_id?: string | null
    thread_id?: string | null
  }): Promise<void>
  deleteGroupMessage(messageId: string): Promise<void>

  // ========== 收件箱操作 ==========

  insertInboxEntry(data: {
    id: string
    recipient_id: string
    message_id: string
    seq: number
  }): Promise<void>
  findInboxEntry(recipientId: string, messageId: string): Promise<{
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
  } | null>

  // ========== 序列号计数器 ==========

  incrementSeqCounter(clawId: string): Promise<number>

  // ========== 辅助查询 ==========

  getClawDisplayName(clawId: string): Promise<string | null>
  getGroupName(groupId: string): Promise<string | null>
}
