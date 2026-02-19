/**
 * Supabase PearlEndorsementRepository Implementation (Phase 3)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IPearlEndorsementRepository,
  PearlEndorsementRecord,
} from '../interfaces/pearl.repository.interface.js'

interface PearlEndorsementRow {
  id: string
  pearl_id: string
  endorser_claw_id: string
  score: number
  comment: string | null
  created_at: string
  updated_at: string
}

function rowToRecord(row: PearlEndorsementRow): PearlEndorsementRecord {
  return {
    id: row.id,
    pearlId: row.pearl_id,
    endorserClawId: row.endorser_claw_id,
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SupabasePearlEndorsementRepository implements IPearlEndorsementRepository {
  constructor(private supabase: SupabaseClient) {}

  async upsert(data: {
    id: string
    pearlId: string
    endorserClawId: string
    score: number
    comment?: string
  }): Promise<PearlEndorsementRecord> {
    const now = new Date().toISOString()
    const { data: row, error } = await this.supabase
      .from('pearl_endorsements')
      .upsert(
        {
          id: data.id,
          pearl_id: data.pearlId,
          endorser_claw_id: data.endorserClawId,
          score: data.score,
          comment: data.comment ?? null,
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'pearl_id,endorser_claw_id' },
      )
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to upsert endorsement: ${error.message}`)
    }

    return rowToRecord(row as PearlEndorsementRow)
  }

  async findByPearl(pearlId: string): Promise<PearlEndorsementRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('pearl_endorsements')
      .select('*')
      .eq('pearl_id', pearlId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to find endorsements: ${error.message}`)
    }

    return (rows as PearlEndorsementRow[]).map(rowToRecord)
  }

  async findOne(pearlId: string, endorserClawId: string): Promise<PearlEndorsementRecord | null> {
    const { data: row, error } = await this.supabase
      .from('pearl_endorsements')
      .select('*')
      .eq('pearl_id', pearlId)
      .eq('endorser_claw_id', endorserClawId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find endorsement: ${error.message}`)
    }

    return rowToRecord(row as PearlEndorsementRow)
  }

  async getScores(pearlId: string): Promise<number[]> {
    const { data: rows, error } = await this.supabase
      .from('pearl_endorsements')
      .select('score')
      .eq('pearl_id', pearlId)

    if (error) {
      throw new Error(`Failed to get endorsement scores: ${error.message}`)
    }

    return (rows as { score: number }[]).map((r) => r.score)
  }
}
