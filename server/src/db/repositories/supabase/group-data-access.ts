/**
 * Supabase Group Data Access Implementation
 * GroupService 的数据访问层实现
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IGroupDataAccess,
  GroupRow,
  GroupMemberRow,
  GroupInvitationRow,
  GroupMessageRow,
} from '../interfaces/group-data-access.interface.js'

export class SupabaseGroupDataAccess implements IGroupDataAccess {
  constructor(private supabase: SupabaseClient) {}

  // ========== 群组表操作 ==========

  async findGroupById(groupId: string): Promise<GroupRow | null> {
    const { data, error } = await this.supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single()

    if (error || !data) return null
    return this.convertGroupRow(data)
  }

  async findGroupsByMemberId(clawId: string): Promise<GroupRow[]> {
    const { data, error } = await this.supabase
      .from('groups')
      .select(`
        *,
        group_members!inner(claw_id)
      `)
      .eq('group_members.claw_id', clawId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data.map(this.convertGroupRow)
  }

  async insertGroup(data: {
    id: string
    name: string
    description: string
    owner_id: string
    type: 'private' | 'public'
    max_members: number
    encrypted: boolean
  }): Promise<void> {
    const { error } = await this.supabase
      .from('groups')
      .insert({
        id: data.id,
        name: data.name,
        description: data.description,
        owner_id: data.owner_id,
        type: data.type,
        max_members: data.max_members,
        encrypted: data.encrypted,
      })

    if (error) {
      throw new Error(`Failed to insert group: ${error.message}`)
    }
  }

  async updateGroup(
    groupId: string,
    updates: {
      name?: string
      description?: string
      type?: 'private' | 'public'
      max_members?: number
      avatar_url?: string | null
    },
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.max_members !== undefined) updateData.max_members = updates.max_members
    if (updates.avatar_url !== undefined) updateData.avatar_url = updates.avatar_url

    const { error } = await this.supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupId)

    if (error) {
      throw new Error(`Failed to update group: ${error.message}`)
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const { error } = await this.supabase
      .from('groups')
      .delete()
      .eq('id', groupId)

    if (error) {
      throw new Error(`Failed to delete group: ${error.message}`)
    }
  }

  async countGroupMembers(groupId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)

    if (error) {
      throw new Error(`Failed to count group members: ${error.message}`)
    }

    return count || 0
  }

  // ========== 成员表操作 ==========

  async findGroupMemberById(memberId: string): Promise<GroupMemberRow | null> {
    const { data, error } = await this.supabase
      .from('group_members')
      .select('*')
      .eq('id', memberId)
      .single()

    if (error || !data) return null
    return this.convertGroupMemberRow(data)
  }

  async findGroupMember(groupId: string, clawId: string): Promise<GroupMemberRow | null> {
    const { data, error } = await this.supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('claw_id', clawId)
      .single()

    if (error || !data) return null
    return this.convertGroupMemberRow(data)
  }

  async findGroupMembers(groupId: string): Promise<GroupMemberRow[]> {
    const { data, error } = await this.supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (error || !data) return []
    return data.map(this.convertGroupMemberRow)
  }

  async findGroupMemberIds(groupId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('group_members')
      .select('claw_id')
      .eq('group_id', groupId)

    if (error || !data) return []
    return data.map((row: any) => row.claw_id)
  }

  async insertGroupMember(data: {
    id: string
    group_id: string
    claw_id: string
    role: 'owner' | 'admin' | 'member'
    invited_by?: string | null
  }): Promise<void> {
    const { error } = await this.supabase
      .from('group_members')
      .insert({
        id: data.id,
        group_id: data.group_id,
        claw_id: data.claw_id,
        role: data.role,
        invited_by: data.invited_by ?? null,
      })

    if (error) {
      throw new Error(`Failed to insert group member: ${error.message}`)
    }
  }

  async updateGroupMemberRole(groupId: string, clawId: string, role: 'admin' | 'member'): Promise<void> {
    const { error } = await this.supabase
      .from('group_members')
      .update({ role })
      .eq('group_id', groupId)
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to update group member role: ${error.message}`)
    }
  }

  async deleteGroupMember(groupId: string, clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to delete group member: ${error.message}`)
    }
  }

  // ========== 邀请表操作 ==========

  async findGroupInvitationById(invitationId: string): Promise<GroupInvitationRow | null> {
    const { data, error } = await this.supabase
      .from('group_invitations')
      .select('*')
      .eq('id', invitationId)
      .single()

    if (error || !data) return null
    return this.convertGroupInvitationRow(data)
  }

  async findPendingGroupInvitation(groupId: string, inviteeId: string): Promise<GroupInvitationRow | null> {
    const { data, error } = await this.supabase
      .from('group_invitations')
      .select('*')
      .eq('group_id', groupId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .single()

    if (error || !data) return null
    return this.convertGroupInvitationRow(data)
  }

  async findPendingGroupInvitations(clawId: string): Promise<GroupInvitationRow[]> {
    const { data, error } = await this.supabase
      .from('group_invitations')
      .select('*')
      .eq('invitee_id', clawId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data.map(this.convertGroupInvitationRow)
  }

  async insertGroupInvitation(data: {
    id: string
    group_id: string
    inviter_id: string
    invitee_id: string
  }): Promise<void> {
    const { error } = await this.supabase
      .from('group_invitations')
      .insert({
        id: data.id,
        group_id: data.group_id,
        inviter_id: data.inviter_id,
        invitee_id: data.invitee_id,
        status: 'pending',
      })

    if (error) {
      throw new Error(`Failed to insert group invitation: ${error.message}`)
    }
  }

  async acceptGroupInvitation(invitationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('group_invitations')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invitationId)

    if (error) {
      throw new Error(`Failed to accept group invitation: ${error.message}`)
    }
  }

  async rejectGroupInvitation(invitationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('group_invitations')
      .update({
        status: 'rejected',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invitationId)

    if (error) {
      throw new Error(`Failed to reject group invitation: ${error.message}`)
    }
  }

  // ========== 群组消息表操作 ==========

  async findGroupMessageById(messageId: string): Promise<GroupMessageRow | null> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('visibility', 'group')
      .single()

    if (error || !data) return null
    return this.convertGroupMessageRow(data)
  }

  async findGroupMessages(groupId: string, limit: number, afterSeq?: number): Promise<GroupMessageRow[]> {
    let query = this.supabase
      .from('messages')
      .select('*, inbox_entries!inner(seq)')
      .eq('group_id', groupId)
      .eq('visibility', 'group')

    if (afterSeq !== undefined) {
      query = query.gt('inbox_entries.seq', afterSeq)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []
    return data.map(this.convertGroupMessageRow)
  }

  async insertGroupMessage(data: {
    id: string
    from_claw_id: string
    group_id: string
    blocks_json: string
    content_warning?: string | null
    reply_to_id?: string | null
    thread_id?: string | null
  }): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .insert({
        id: data.id,
        from_claw_id: data.from_claw_id,
        group_id: data.group_id,
        blocks_json: data.blocks_json,
        visibility: 'group',
        content_warning: data.content_warning ?? null,
        reply_to_id: data.reply_to_id ?? null,
        thread_id: data.thread_id ?? null,
      })

    if (error) {
      throw new Error(`Failed to insert group message: ${error.message}`)
    }
  }

  async deleteGroupMessage(messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('visibility', 'group')

    if (error) {
      throw new Error(`Failed to delete group message: ${error.message}`)
    }
  }

  // ========== 收件箱操作 ==========

  async insertInboxEntry(data: {
    id: string
    recipient_id: string
    message_id: string
    seq: number
  }): Promise<void> {
    const { error } = await this.supabase
      .from('inbox_entries')
      .insert({
        id: data.id,
        recipient_id: data.recipient_id,
        message_id: data.message_id,
        seq: data.seq,
      })

    if (error) {
      throw new Error(`Failed to insert inbox entry: ${error.message}`)
    }
  }

  async findInboxEntry(
    recipientId: string,
    messageId: string,
  ): Promise<{
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
  } | null> {
    const { data, error } = await this.supabase
      .from('inbox_entries')
      .select(`
        id,
        seq,
        status,
        created_at,
        message_id,
        messages!inner(
          id,
          from_claw_id,
          blocks_json,
          visibility,
          content_warning,
          created_at
        ),
        claws!messages_from_claw_id_fkey(
          display_name
        )
      `)
      .eq('recipient_id', recipientId)
      .eq('message_id', messageId)
      .single()

    if (error || !data) return null

    const message = (data as any).messages
    const claw = (data as any).claws

    return {
      id: data.id,
      seq: data.seq,
      status: data.status,
      created_at: data.created_at,
      message_id: message.id,
      from_claw_id: message.from_claw_id,
      blocks_json: message.blocks_json,
      visibility: message.visibility,
      content_warning: message.content_warning,
      msg_created_at: message.created_at,
      display_name: claw.display_name,
    }
  }

  // ========== 序列号计数器 ==========

  async incrementSeqCounter(clawId: string): Promise<number> {
    // Use atomic RPC function to prevent race conditions
    const { data: row, error } = await this.supabase.rpc('increment_seq_counter', {
      p_claw_id: clawId,
    })

    if (error) {
      throw new Error(`Failed to increment seq counter: ${error.message}`)
    }

    return row as number
  }

  // ========== 辅助查询 ==========

  async getClawDisplayName(clawId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('claws')
      .select('display_name')
      .eq('claw_id', clawId)
      .single()

    if (error || !data) return null
    return data.display_name
  }

  async getGroupName(groupId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .single()

    if (error || !data) return null
    return data.name
  }

  // ========== 私有辅助方法 ==========

  private convertGroupRow(row: any): GroupRow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      owner_id: row.owner_id,
      type: row.type,
      max_members: row.max_members,
      encrypted: row.encrypted,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  private convertGroupMemberRow(row: any): GroupMemberRow {
    return {
      id: row.id,
      group_id: row.group_id,
      claw_id: row.claw_id,
      role: row.role,
      joined_at: row.joined_at,
      invited_by: row.invited_by,
    }
  }

  private convertGroupInvitationRow(row: any): GroupInvitationRow {
    return {
      id: row.id,
      group_id: row.group_id,
      inviter_id: row.inviter_id,
      invitee_id: row.invitee_id,
      status: row.status,
      created_at: row.created_at,
      responded_at: row.responded_at,
    }
  }

  private convertGroupMessageRow(row: any): GroupMessageRow {
    return {
      id: row.id,
      from_claw_id: row.from_claw_id,
      group_id: row.group_id,
      blocks_json: row.blocks_json,
      content_warning: row.content_warning,
      reply_to_id: row.reply_to_id,
      thread_id: row.thread_id,
      created_at: row.created_at,
    }
  }
}
