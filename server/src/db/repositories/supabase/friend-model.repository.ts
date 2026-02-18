/**
 * Supabase FriendModel Repository Implementation
 * 好友心智模型数据访问实现（Phase 2）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IFriendModelRepository,
  FriendModelRecord,
} from '../interfaces/friend-model.repository.interface.js'

interface FriendModelRow {
  claw_id: string
  friend_id: string
  last_known_state: string | null
  inferred_interests: string[] | null   // JSONB → already parsed by Supabase client
  expertise_tags: Record<string, number> | null  // JSONB → already parsed
  last_heartbeat_at: string | null
  last_interaction_at: string | null
  inferred_needs: string[] | null
  emotional_tone: string | null
  knowledge_gaps: string[] | null
  updated_at: string
}

function rowToRecord(row: FriendModelRow): FriendModelRecord {
  return {
    clawId: row.claw_id,
    friendId: row.friend_id,
    lastKnownState: row.last_known_state,
    inferredInterests: row.inferred_interests ?? [],
    expertiseTags: row.expertise_tags ?? {},
    lastHeartbeatAt: row.last_heartbeat_at,
    lastInteractionAt: row.last_interaction_at,
    inferredNeeds: row.inferred_needs,
    emotionalTone: row.emotional_tone,
    knowledgeGaps: row.knowledge_gaps,
    updatedAt: row.updated_at,
  }
}

export class SupabaseFriendModelRepository implements IFriendModelRepository {
  constructor(private supabase: SupabaseClient) {}

  async get(clawId: string, friendId: string): Promise<FriendModelRecord | null> {
    const { data: row, error } = await this.supabase
      .from('friend_models')
      .select('*')
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to get friend model: ${error.message}`)
    }

    return rowToRecord(row as FriendModelRow)
  }

  async getAll(clawId: string): Promise<FriendModelRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('friend_models')
      .select('*')
      .eq('claw_id', clawId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get all friend models: ${error.message}`)
    }

    return (rows as FriendModelRow[]).map(rowToRecord)
  }

  async create(record: { clawId: string; friendId: string }): Promise<void> {
    const { error } = await this.supabase.from('friend_models').upsert(
      {
        claw_id: record.clawId,
        friend_id: record.friendId,
      },
      { onConflict: 'claw_id,friend_id', ignoreDuplicates: true }
    )

    if (error) {
      throw new Error(`Failed to create friend model: ${error.message}`)
    }
  }

  async updateFromHeartbeat(
    clawId: string,
    friendId: string,
    data: {
      inferredInterests: string[]
      expertiseTags: Record<string, number>
      lastKnownState?: string
      lastHeartbeatAt: string
    }
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {
      inferred_interests: data.inferredInterests,
      expertise_tags: data.expertiseTags,
      last_heartbeat_at: data.lastHeartbeatAt,
      updated_at: new Date().toISOString(),
    }

    if (data.lastKnownState !== undefined) {
      updatePayload['last_known_state'] = data.lastKnownState
    }

    const { error } = await this.supabase
      .from('friend_models')
      .update(updatePayload)
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to update friend model from heartbeat: ${error.message}`)
    }
  }

  async touchInteraction(clawId: string, friendId: string): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.supabase
      .from('friend_models')
      .update({ last_interaction_at: now, updated_at: now })
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to touch interaction: ${error.message}`)
    }
  }

  async updateLayer1Fields(
    clawId: string,
    friendId: string,
    data: {
      inferredNeeds?: string[]
      emotionalTone?: string
      knowledgeGaps?: string[]
    }
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (data.inferredNeeds !== undefined) {
      updatePayload['inferred_needs'] = data.inferredNeeds
    }
    if (data.emotionalTone !== undefined) {
      updatePayload['emotional_tone'] = data.emotionalTone
    }
    if (data.knowledgeGaps !== undefined) {
      updatePayload['knowledge_gaps'] = data.knowledgeGaps
    }

    const { error } = await this.supabase
      .from('friend_models')
      .update(updatePayload)
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to update Layer 1 fields: ${error.message}`)
    }
  }

  async delete(clawId: string, friendId: string): Promise<void> {
    const { error } = await this.supabase
      .from('friend_models')
      .delete()
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to delete friend model: ${error.message}`)
    }
  }
}
