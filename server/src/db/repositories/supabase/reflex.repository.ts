/**
 * Supabase ReflexRepository Implementation (Phase 4)
 * JSONB fields are automatically deserialized by Supabase client
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type {
  IReflexRepository,
  ReflexRecord,
  TriggerLayer,
  ValueLayer,
  ReflexBehavior,
  ReflexSource,
} from '../interfaces/reflex.repository.interface.js'

interface ReflexRow {
  id: string
  claw_id: string
  name: string
  value_layer: string
  behavior: string
  trigger_layer: number
  trigger_config: Record<string, unknown>  // JSONB → already parsed
  enabled: boolean
  confidence: number
  source: string
  created_at: string
  updated_at: string
}

function rowToRecord(row: ReflexRow): ReflexRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    name: row.name,
    valueLayer: row.value_layer as ValueLayer,
    behavior: row.behavior as ReflexBehavior,
    triggerLayer: row.trigger_layer as TriggerLayer,
    triggerConfig: row.trigger_config ?? {},
    enabled: row.enabled,
    confidence: row.confidence,
    source: row.source as ReflexSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SupabaseReflexRepository implements IReflexRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(data: {
    id: string
    clawId: string
    name: string
    valueLayer: ValueLayer
    behavior: ReflexBehavior
    triggerLayer: TriggerLayer
    triggerConfig: Record<string, unknown>
    enabled: boolean
    confidence: number
    source: ReflexSource
  }): Promise<ReflexRecord> {
    const now = new Date().toISOString()
    const { data: row, error } = await this.supabase
      .from('reflexes')
      .insert({
        id: data.id,
        claw_id: data.clawId,
        name: data.name,
        value_layer: data.valueLayer,
        behavior: data.behavior,
        trigger_layer: data.triggerLayer,
        trigger_config: data.triggerConfig,
        enabled: data.enabled,
        confidence: data.confidence,
        source: data.source,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) throw new Error(`Failed to create reflex: ${error.message}`)
    return rowToRecord(row as ReflexRow)
  }

  async findByName(clawId: string, name: string): Promise<ReflexRecord | null> {
    const { data: row, error } = await this.supabase
      .from('reflexes')
      .select('*')
      .eq('claw_id', clawId)
      .eq('name', name)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find reflex: ${error.message}`)
    }
    return rowToRecord(row as ReflexRow)
  }

  async findEnabled(clawId: string, triggerLayer?: TriggerLayer): Promise<ReflexRecord[]> {
    let query = this.supabase
      .from('reflexes')
      .select('*')
      .eq('claw_id', clawId)
      .eq('enabled', true)

    if (triggerLayer !== undefined) {
      query = query.eq('trigger_layer', triggerLayer)
    }

    const { data: rows, error } = await query.order('created_at', { ascending: true })
    if (error) throw new Error(`Failed to find enabled reflexes: ${error.message}`)
    return (rows as ReflexRow[]).map(rowToRecord)
  }

  async findAll(clawId: string): Promise<ReflexRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('reflexes')
      .select('*')
      .eq('claw_id', clawId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(`Failed to find reflexes: ${error.message}`)
    return (rows as ReflexRow[]).map(rowToRecord)
  }

  async setEnabled(clawId: string, name: string, enabled: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('reflexes')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('claw_id', clawId)
      .eq('name', name)

    if (error) throw new Error(`Failed to set reflex enabled: ${error.message}`)
  }

  async updateConfidence(clawId: string, name: string, confidence: number): Promise<void> {
    const { error } = await this.supabase
      .from('reflexes')
      .update({ confidence, updated_at: new Date().toISOString() })
      .eq('claw_id', clawId)
      .eq('name', name)

    if (error) throw new Error(`Failed to update confidence: ${error.message}`)
  }

  async updateConfig(
    clawId: string,
    name: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('reflexes')
      .update({ trigger_config: config, updated_at: new Date().toISOString() })
      .eq('claw_id', clawId)
      .eq('name', name)

    if (error) throw new Error(`Failed to update reflex config: ${error.message}`)
  }

  async upsertBuiltins(
    clawId: string,
    builtins: Array<Omit<ReflexRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const rows = builtins.map((b) => ({
      id: randomUUID(),
      claw_id: clawId,
      name: b.name,
      value_layer: b.valueLayer,
      behavior: b.behavior,
      trigger_layer: b.triggerLayer,
      trigger_config: b.triggerConfig,
      enabled: b.enabled,
      confidence: b.confidence,
      source: b.source,
      created_at: now,
      updated_at: now,
    }))

    const { error } = await this.supabase
      .from('reflexes')
      .upsert(rows, { onConflict: 'claw_id,name', ignoreDuplicates: false })

    if (error) throw new Error(`Failed to upsert builtins: ${error.message}`)
  }
}
