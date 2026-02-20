/**
 * Supabase BriefingRepository（Phase 6）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingRecord, IBriefingRepository } from '../interfaces/briefing.repository.interface.js'

interface BriefingRow {
  id: string
  claw_id: string
  type: string
  content: string
  raw_data: Record<string, unknown>
  generated_at: string
  acknowledged_at: string | null
}

function rowToBriefing(row: BriefingRow): BriefingRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    type: row.type as 'daily' | 'weekly',
    content: row.content,
    rawData: row.raw_data,
    generatedAt: row.generated_at,
    acknowledgedAt: row.acknowledged_at,
  }
}

export class SupabaseBriefingRepository implements IBriefingRepository {
  constructor(private client: SupabaseClient) {}

  async create(data: {
    id: string
    clawId: string
    type: 'daily' | 'weekly'
    content: string
    rawData: Record<string, unknown>
  }): Promise<BriefingRecord> {
    const generatedAt = new Date().toISOString()
    const { data: rows, error } = await this.client
      .from('briefings')
      .insert({
        id: data.id,
        claw_id: data.clawId,
        type: data.type,
        content: data.content,
        raw_data: data.rawData,
        generated_at: generatedAt,
      })
      .select()
    if (error) throw new Error(error.message)
    if (rows && (rows as BriefingRow[]).length > 0) {
      return rowToBriefing((rows as BriefingRow[])[0])
    }
    return {
      id: data.id,
      clawId: data.clawId,
      type: data.type,
      content: data.content,
      rawData: data.rawData,
      generatedAt,
      acknowledgedAt: null,
    }
  }

  async findLatest(clawId: string): Promise<BriefingRecord | null> {
    const { data, error } = await this.client
      .from('briefings')
      .select('*')
      .eq('claw_id', clawId)
      .order('generated_at', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    if (!data || (data as BriefingRow[]).length === 0) return null
    return rowToBriefing((data as BriefingRow[])[0])
  }

  async findHistory(
    clawId: string,
    filters?: { type?: 'daily' | 'weekly'; limit?: number; offset?: number }
  ): Promise<BriefingRecord[]> {
    const limit = Math.min(filters?.limit ?? 10, 50)
    const offset = filters?.offset ?? 0
    let query = this.client
      .from('briefings')
      .select('*')
      .eq('claw_id', clawId)
      .order('generated_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1)
    if (filters?.type) {
      query = query.eq('type', filters.type)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as BriefingRow[]).map(rowToBriefing)
  }

  async acknowledge(id: string, acknowledgedAt: string): Promise<void> {
    const { error } = await this.client
      .from('briefings')
      .update({ acknowledged_at: acknowledgedAt })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  async getUnreadCount(clawId: string): Promise<number> {
    const { count, error } = await this.client
      .from('briefings')
      .select('*', { count: 'exact', head: true })
      .eq('claw_id', clawId)
      .is('acknowledged_at', null)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  async deleteOlderThan(clawId: string, cutoffDate: string): Promise<number> {
    const { data, error } = await this.client
      .from('briefings')
      .delete()
      .eq('claw_id', clawId)
      .lt('generated_at', cutoffDate)
      .select()
    if (error) throw new Error(error.message)
    return (data as unknown[])?.length ?? 0
  }
}
