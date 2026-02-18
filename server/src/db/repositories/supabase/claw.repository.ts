/**
 * Supabase Claw Repository Implementation
 * 基于 @supabase/supabase-js 的用户数据访问实现
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IClawRepository,
  RegisterClawDTO,
  UpdateClawDTO,
  UpdateAutonomyConfigDTO,
} from '../interfaces/claw.repository.interface.js'
import type { Claw } from '@clawbuds/shared/types/claw'

interface ClawRow {
  claw_id: string
  public_key: string
  display_name: string
  bio: string
  status: 'active' | 'suspended' | 'deactivated'
  created_at: string
  last_seen_at: string
  claw_type: 'personal' | 'service' | 'bot'
  discoverable: boolean
  tags: string[]
  capabilities: string[]
  avatar_url: string | null
  autonomy_level: 'notifier' | 'drafter' | 'autonomous' | 'delegator'
  autonomy_config: any
  brain_provider: string
  notification_prefs: any
}

export class SupabaseClawRepository implements IClawRepository {
  constructor(private supabase: SupabaseClient) {}

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
      discoverable: row.discoverable,
      tags: row.tags,
      capabilities: row.capabilities,
      avatarUrl: row.avatar_url ?? undefined,
      autonomyLevel: row.autonomy_level,
      autonomyConfig: row.autonomy_config,
      brainProvider: row.brain_provider,
      notificationPrefs: row.notification_prefs,
    }
  }

  // ========== 创建 ==========

  async register(data: RegisterClawDTO): Promise<Claw> {
    const insertData: any = {
      public_key: data.publicKey,
      display_name: data.displayName,
      bio: data.bio ?? '',
      discoverable: data.discoverable ?? false,
      tags: data.tags ?? [],
    }

    // 如果提供了 clawId,使用它;否则让数据库生成 UUID
    if (data.clawId) {
      insertData.claw_id = data.clawId
    }

    const { data: row, error } = await this.supabase
      .from('claws')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to register claw: ${error.message}`)
    }

    return this.rowToClaw(row)
  }

  // ========== 查询 ==========

  async findById(clawId: string): Promise<Claw | null> {
    const { data: row, error } = await this.supabase
      .from('claws')
      .select('*')
      .eq('claw_id', clawId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw new Error(`Failed to find claw: ${error.message}`)
    }

    return row ? this.rowToClaw(row) : null
  }

  async findByPublicKey(publicKey: string): Promise<Claw | null> {
    const { data: row, error } = await this.supabase
      .from('claws')
      .select('*')
      .eq('public_key', publicKey)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find claw by public key: ${error.message}`)
    }

    return row ? this.rowToClaw(row) : null
  }

  async findMany(clawIds: string[]): Promise<Claw[]> {
    if (clawIds.length === 0) return []

    const { data: rows, error } = await this.supabase
      .from('claws')
      .select('*')
      .in('claw_id', clawIds)

    if (error) {
      throw new Error(`Failed to find many claws: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToClaw(row))
  }

  async findDiscoverable(options?: {
    limit?: number
    offset?: number
    tags?: string[]
  }): Promise<Claw[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    let query = this.supabase
      .from('claws')
      .select('*')
      .eq('discoverable', true)
      .eq('status', 'active')

    // 如果指定了 tags，使用 PostgreSQL JSONB 查询
    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags)
    }

    const { data: rows, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find discoverable claws: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToClaw(row))
  }

  // ========== 更新 ==========

  async updateProfile(clawId: string, updates: UpdateClawDTO): Promise<Claw | null> {
    const updateData: any = {}

    if (updates.displayName !== undefined) {
      updateData.display_name = updates.displayName
    }
    if (updates.bio !== undefined) {
      updateData.bio = updates.bio
    }
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags
    }
    if (updates.discoverable !== undefined) {
      updateData.discoverable = updates.discoverable
    }
    if (updates.avatarUrl !== undefined) {
      updateData.avatar_url = updates.avatarUrl
    }

    if (Object.keys(updateData).length === 0) {
      return this.findById(clawId)
    }

    const { data: row, error } = await this.supabase
      .from('claws')
      .update(updateData)
      .eq('claw_id', clawId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to update claw profile: ${error.message}`)
    }

    return row ? this.rowToClaw(row) : null
  }

  async updateLastSeen(clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('claws')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to update last seen: ${error.message}`)
    }
  }

  async updateAutonomyConfig(
    clawId: string,
    config: UpdateAutonomyConfigDTO,
  ): Promise<Claw | null> {
    const updateData: any = {}

    if (config.autonomyLevel !== undefined) {
      updateData.autonomy_level = config.autonomyLevel
    }
    if (config.autonomyConfig !== undefined) {
      updateData.autonomy_config = config.autonomyConfig
    }

    if (Object.keys(updateData).length === 0) {
      return this.findById(clawId)
    }

    const { data: row, error } = await this.supabase
      .from('claws')
      .update(updateData)
      .eq('claw_id', clawId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to update autonomy config: ${error.message}`)
    }

    return row ? this.rowToClaw(row) : null
  }

  async updateNotificationPrefs(clawId: string, prefs: any): Promise<Claw | null> {
    const { data: row, error } = await this.supabase
      .from('claws')
      .update({ notification_prefs: prefs })
      .eq('claw_id', clawId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to update notification prefs: ${error.message}`)
    }

    return row ? this.rowToClaw(row) : null
  }

  // ========== 删除（软删除）==========

  async deactivate(clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('claws')
      .update({ status: 'deactivated' })
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to deactivate claw: ${error.message}`)
    }
  }

  // ========== 统计 ==========

  async exists(clawId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('claws')
      .select('*', { count: 'exact', head: true })
      .eq('claw_id', clawId)

    if (error) {
      throw new Error(`Failed to check claw exists: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  async count(filters?: { status?: string; discoverable?: boolean }): Promise<number> {
    let query = this.supabase.from('claws').select('*', { count: 'exact', head: true })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.discoverable !== undefined) {
      query = query.eq('discoverable', filters.discoverable)
    }

    const { count, error } = await query

    if (error) {
      throw new Error(`Failed to count claws: ${error.message}`)
    }

    return count ?? 0
  }

  // ========== Push 订阅 ==========

  async savePushSubscription(clawId: string, data: {
    id: string
    endpoint: string
    keyP256dh: string
    keyAuth: string
  }): Promise<{ id: string; endpoint: string }> {
    const { error } = await this.supabase
      .from('push_subscriptions')
      .upsert(
        {
          id: data.id,
          claw_id: clawId,
          endpoint: data.endpoint,
          key_p256dh: data.keyP256dh,
          key_auth: data.keyAuth,
        },
        { onConflict: 'claw_id,endpoint' },
      )

    if (error) {
      throw new Error(`Failed to save push subscription: ${error.message}`)
    }

    return { id: data.id, endpoint: data.endpoint }
  }

  async deletePushSubscription(clawId: string, endpoint: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('push_subscriptions')
      .delete()
      .eq('claw_id', clawId)
      .eq('endpoint', endpoint)
      .select('id')

    if (error) {
      throw new Error(`Failed to delete push subscription: ${error.message}`)
    }

    return (data?.length ?? 0) > 0
  }
}
