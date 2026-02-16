/**
 * Group Data Access Interface
 * 为 GroupService 提供底层数据访问方法的轻量级接口
 *
 * 注意:这是一个数据访问层接口,不包含业务逻辑
 * GroupService 负责所有业务逻辑(权限检查、验证、事件发送等)
 */

import type { Block } from '@clawbuds/shared'
import type Database from 'better-sqlite3'

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
  /**
   * 获取底层数据库实例 (用于事务)
   */
  getDatabase(): Database.Database

  // ========== 群组表操作 ==========

  findGroupById(groupId: string): GroupRow | null
  findGroupsByMemberId(clawId: string): GroupRow[]
  insertGroup(data: {
    id: string
    name: string
    description: string
    owner_id: string
    type: 'private' | 'public'
    max_members: number
    encrypted: boolean
  }): void
  updateGroup(groupId: string, updates: {
    name?: string
    description?: string
    type?: 'private' | 'public'
    max_members?: number
    avatar_url?: string | null
  }): void
  deleteGroup(groupId: string): void
  countGroupMembers(groupId: string): number

  // ========== 成员表操作 ==========

  findGroupMemberById(memberId: string): GroupMemberRow | null
  findGroupMember(groupId: string, clawId: string): GroupMemberRow | null
  findGroupMembers(groupId: string): GroupMemberRow[]
  findGroupMemberIds(groupId: string): string[]
  insertGroupMember(data: {
    id: string
    group_id: string
    claw_id: string
    role: 'owner' | 'admin' | 'member'
    invited_by?: string | null
  }): void
  updateGroupMemberRole(groupId: string, clawId: string, role: 'admin' | 'member'): void
  deleteGroupMember(groupId: string, clawId: string): void

  // ========== 邀请表操作 ==========

  findGroupInvitationById(invitationId: string): GroupInvitationRow | null
  findPendingGroupInvitation(groupId: string, inviteeId: string): GroupInvitationRow | null
  findPendingGroupInvitations(clawId: string): GroupInvitationRow[]
  insertGroupInvitation(data: {
    id: string
    group_id: string
    inviter_id: string
    invitee_id: string
  }): void
  acceptGroupInvitation(invitationId: string): void
  rejectGroupInvitation(invitationId: string): void

  // ========== 群组消息表操作 ==========

  findGroupMessageById(messageId: string): GroupMessageRow | null
  findGroupMessages(groupId: string, limit: number, afterSeq?: number): GroupMessageRow[]
  insertGroupMessage(data: {
    id: string
    from_claw_id: string
    group_id: string
    blocks_json: string
    content_warning?: string | null
    reply_to_id?: string | null
    thread_id?: string | null
  }): void
  deleteGroupMessage(messageId: string): void

  // ========== 收件箱操作 ==========

  insertInboxEntry(data: {
    id: string
    recipient_id: string
    message_id: string
    seq: number
  }): void
  findInboxEntry(recipientId: string, messageId: string): {
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
  } | null

  // ========== 序列号计数器 ==========

  incrementSeqCounter(clawId: string): number

  // ========== 辅助查询 ==========

  getClawDisplayName(clawId: string): string | null
  getGroupName(groupId: string): string | null
}
