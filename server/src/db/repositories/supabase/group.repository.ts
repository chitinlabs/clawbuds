/**
 * Supabase Group Repository Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IGroupRepository,
  CreateGroupDTO,
  UpdateGroupDTO,
  GroupProfile,
  GroupMember,
  GroupPermissionLevel,
} from '../interfaces/group.repository.interface.js'

interface GroupRow {
  id: string
  name: string
  description: string
  owner_id: string
  type: 'private' | 'public'
  created_at: string
  updated_at: string
}

export class SupabaseGroupRepository implements IGroupRepository {
  constructor(private supabase: SupabaseClient) {}

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

  async create(data: CreateGroupDTO): Promise<GroupProfile> {
    const isPublic = data.isPublic ?? false

    const { data: group, error: groupError } = await this.supabase
      .from('groups')
      .insert({
        name: data.name,
        description: data.description ?? '',
        owner_id: data.createdBy,
        type: isPublic ? 'public' : 'private',
      })
      .select()
      .single()

    if (groupError) {
      throw new Error(`Failed to create group: ${groupError.message}`)
    }

    // 将创建者添加为群主
    const { error: memberError } = await this.supabase.from('group_members').insert({
      group_id: group.id,
      claw_id: data.createdBy,
      role: 'owner',
    })

    if (memberError) {
      throw new Error(`Failed to add owner to group: ${memberError.message}`)
    }

    return this.rowToGroupProfile(group)
  }

  async findById(groupId: string): Promise<GroupProfile | null> {
    const { data: row, error } = await this.supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find group: ${error.message}`)
    }

    return row ? this.rowToGroupProfile(row) : null
  }

  async findByMember(clawId: string): Promise<GroupProfile[]> {
    const { data: rows, error } = await this.supabase
      .from('groups')
      .select('*, group_members!inner(*)')
      .eq('group_members.claw_id', clawId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to find groups by member: ${error.message}`)
    }

    return Promise.all((rows || []).map((row) => this.rowToGroupProfile(row)))
  }

  async findPublicGroups(options?: {
    limit?: number
    offset?: number
  }): Promise<GroupProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const { data: rows, error } = await this.supabase
      .from('groups')
      .select('*')
      .eq('type', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find public groups: ${error.message}`)
    }

    return Promise.all((rows || []).map((row) => this.rowToGroupProfile(row)))
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const { data: rows, error } = await this.supabase
      .from('group_members')
      .select('*, claws!inner(*)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to get group members: ${error.message}`)
    }

    return (rows || []).map((row: any) => {
      const claw = Array.isArray(row.claws) ? row.claws[0] : row.claws
      return {
        clawId: claw.claw_id,
        displayName: claw.display_name,
        avatarUrl: claw.avatar_url ?? undefined,
        permission: row.role,
        joinedAt: row.joined_at,
      }
    })
  }

  async getMemberPermission(
    groupId: string,
    clawId: string,
  ): Promise<GroupPermissionLevel | null> {
    const { data: row, error } = await this.supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('claw_id', clawId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to get member permission: ${error.message}`)
    }

    return row?.role ?? null
  }

  async update(groupId: string, data: UpdateGroupDTO): Promise<GroupProfile | null> {
    const updateData: any = {}

    if (data.name !== undefined) {
      updateData.name = data.name
    }
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    if (data.isPublic !== undefined) {
      updateData.type = data.isPublic ? 'public' : 'private'
    }

    if (Object.keys(updateData).length === 0) {
      return this.findById(groupId)
    }

    updateData.updated_at = new Date().toISOString()

    const { data: row, error } = await this.supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to update group: ${error.message}`)
    }

    return row ? this.rowToGroupProfile(row) : null
  }

  async addMember(
    groupId: string,
    clawId: string,
    permission?: GroupPermissionLevel,
  ): Promise<void> {
    const { error } = await this.supabase.from('group_members').insert({
      group_id: groupId,
      claw_id: clawId,
      role: permission ?? 'member',
    })

    if (error) {
      throw new Error(`Failed to add member: ${error.message}`)
    }
  }

  async removeMember(groupId: string, clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to remove member: ${error.message}`)
    }
  }

  async updateMemberPermission(
    groupId: string,
    clawId: string,
    permission: GroupPermissionLevel,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('group_members')
      .update({ role: permission })
      .eq('group_id', groupId)
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to update member permission: ${error.message}`)
    }
  }

  async delete(groupId: string): Promise<void> {
    const { error } = await this.supabase.from('groups').delete().eq('id', groupId)

    if (error) {
      throw new Error(`Failed to delete group: ${error.message}`)
    }
  }

  async isMember(groupId: string, clawId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to check member: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  async countMembers(groupId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)

    if (error) {
      throw new Error(`Failed to count members: ${error.message}`)
    }

    return count ?? 0
  }

  async exists(groupId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('groups')
      .select('*', { count: 'exact', head: true })
      .eq('id', groupId)

    if (error) {
      throw new Error(`Failed to check group exists: ${error.message}`)
    }

    return (count ?? 0) > 0
  }
}
