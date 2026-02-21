/**
 * Supabase RelationshipStrength Repository Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IRelationshipStrengthRepository,
  RelationshipStrengthRecord,
  DunbarLayer,
} from '../interfaces/relationship-strength.repository.interface.js'

interface RSRow {
  claw_id: string
  friend_id: string
  strength: number
  dunbar_layer: DunbarLayer
  manual_override: boolean
  last_interaction_at: string | null
  updated_at: string
}

// Dunbar 层级的强度下界（用于 at-risk 检测）
const LAYER_THRESHOLDS: Record<DunbarLayer, number> = {
  core: 0.8,
  sympathy: 0.6,
  active: 0.3,
  casual: 0.0,
}

function rowToRecord(row: RSRow): RelationshipStrengthRecord {
  return {
    clawId: row.claw_id,
    friendId: row.friend_id,
    strength: row.strength,
    dunbarLayer: row.dunbar_layer,
    manualOverride: row.manual_override,
    lastInteractionAt: row.last_interaction_at,
    updatedAt: row.updated_at,
  }
}

export class SupabaseRelationshipStrengthRepository implements IRelationshipStrengthRepository {
  constructor(private supabase: SupabaseClient) {}

  async get(clawId: string, friendId: string): Promise<RelationshipStrengthRecord | null> {
    const { data: row, error } = await this.supabase
      .from('relationship_strength')
      .select('*')
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to get relationship strength: ${error.message}`)
    }

    return rowToRecord(row as RSRow)
  }

  async getAllForClaw(clawId: string): Promise<RelationshipStrengthRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('relationship_strength')
      .select('*')
      .eq('claw_id', clawId)
      .order('strength', { ascending: false })

    if (error) {
      throw new Error(`Failed to get all relationships for claw: ${error.message}`)
    }

    return (rows as RSRow[]).map(rowToRecord)
  }

  async create(record: {
    clawId: string
    friendId: string
    strength: number
    dunbarLayer: DunbarLayer
  }): Promise<void> {
    const { error } = await this.supabase.from('relationship_strength').insert({
      claw_id: record.clawId,
      friend_id: record.friendId,
      strength: record.strength,
      dunbar_layer: record.dunbarLayer,
    })

    if (error) {
      throw new Error(`Failed to create relationship strength: ${error.message}`)
    }
  }

  async updateStrength(clawId: string, friendId: string, strength: number): Promise<void> {
    const { error } = await this.supabase
      .from('relationship_strength')
      .update({ strength, updated_at: new Date().toISOString() })
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to update strength: ${error.message}`)
    }
  }

  async updateLayer(
    clawId: string,
    friendId: string,
    layer: DunbarLayer,
    manualOverride: boolean,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('relationship_strength')
      .update({
        dunbar_layer: layer,
        manual_override: manualOverride,
        updated_at: new Date().toISOString(),
      })
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to update layer: ${error.message}`)
    }
  }

  async touchInteraction(clawId: string, friendId: string): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.supabase
      .from('relationship_strength')
      .update({ last_interaction_at: now, updated_at: now })
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to touch interaction: ${error.message}`)
    }
  }

  async decayAll(computeDecayRate: (strength: number) => number): Promise<number> {
    const { data: rows, error } = await this.supabase
      .from('relationship_strength')
      .select('claw_id, friend_id, strength')

    if (error) {
      throw new Error(`Failed to fetch records for decay: ${error.message}`)
    }

    if (!rows || rows.length === 0) return 0

    const updates = (rows as Pick<RSRow, 'claw_id' | 'friend_id' | 'strength'>[]).map((row) => {
      const newStrength = Math.max(0.01, row.strength * computeDecayRate(row.strength))
      return this.supabase
        .from('relationship_strength')
        .update({ strength: newStrength, updated_at: new Date().toISOString() })
        .eq('claw_id', row.claw_id)
        .eq('friend_id', row.friend_id)
    })

    await Promise.all(updates)
    return rows.length
  }

  async getAtRisk(
    clawId: string,
    margin: number,
    inactiveDays: number,
  ): Promise<RelationshipStrengthRecord[]> {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error } = await this.supabase
      .from('relationship_strength')
      .select('*')
      .eq('claw_id', clawId)
      .or(`last_interaction_at.is.null,last_interaction_at.lt.${cutoff}`)

    if (error) {
      throw new Error(`Failed to get at-risk relationships: ${error.message}`)
    }

    return (rows as RSRow[])
      .filter((row) => {
        const threshold = LAYER_THRESHOLDS[row.dunbar_layer]
        return row.strength - threshold <= margin && row.strength > threshold
      })
      .map(rowToRecord)
  }

  async delete(clawId: string, friendId: string): Promise<void> {
    const { error } = await this.supabase
      .from('relationship_strength')
      .delete()
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)

    if (error) {
      throw new Error(`Failed to delete relationship strength: ${error.message}`)
    }
  }

  async findAllOwners(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('relationship_strength')
      .select('claw_id')

    if (error) {
      throw new Error(`Failed to find all owners: ${error.message}`)
    }

    const unique = new Set((data ?? []).map((r: { claw_id: string }) => r.claw_id))
    return Array.from(unique)
  }
}
