/**
 * Supabase Trust Repository Implementation (Phase 7)
 * 五维信任模型数据访问层（Supabase 实现）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ITrustRepository,
  TrustScoreRecord,
} from '../interfaces/trust.repository.interface.js'

/** Not-found codes for Supabase queries */
const NOT_FOUND_CODES = new Set(['PGRST116', '22P02'])

interface TrustScoreRow {
  id: string
  from_claw_id: string
  to_claw_id: string
  domain: string
  q_score: number
  h_score: number | null
  n_score: number
  w_score: number
  composite: number
  updated_at: string
}

function rowToRecord(row: TrustScoreRow): TrustScoreRecord {
  return {
    id: row.id,
    fromClawId: row.from_claw_id,
    toClawId: row.to_claw_id,
    domain: row.domain,
    qScore: row.q_score,
    hScore: row.h_score,
    nScore: row.n_score,
    wScore: row.w_score,
    composite: row.composite,
    updatedAt: row.updated_at,
  }
}

function clamp(val: number): number {
  return Math.max(0.0, Math.min(1.0, val))
}

export class SupabaseTrustRepository implements ITrustRepository {
  constructor(private supabase: SupabaseClient) {}

  async get(
    fromClawId: string,
    toClawId: string,
    domain: string,
  ): Promise<TrustScoreRecord | null> {
    const { data: row, error } = await this.supabase
      .from('trust_scores')
      .select('*')
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)
      .maybeSingle()

    if (error && !NOT_FOUND_CODES.has(error.code)) {
      throw new Error(`Failed to get trust score: ${error.message}`)
    }
    return row ? rowToRecord(row as TrustScoreRow) : null
  }

  async getAllDomains(fromClawId: string, toClawId: string): Promise<TrustScoreRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('trust_scores')
      .select('*')
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .order('domain')

    if (error) {
      throw new Error(`Failed to get trust domains: ${error.message}`)
    }
    return (rows ?? []).map((r) => rowToRecord(r as TrustScoreRow))
  }

  async getAllForClaw(fromClawId: string, domain?: string): Promise<TrustScoreRecord[]> {
    let query = this.supabase
      .from('trust_scores')
      .select('*')
      .eq('from_claw_id', fromClawId)
      .order('composite', { ascending: false })

    if (domain !== undefined) {
      query = query.eq('domain', domain)
    }

    const { data: rows, error } = await query

    if (error) {
      throw new Error(`Failed to get trust scores for claw: ${error.message}`)
    }
    return (rows ?? []).map((r) => rowToRecord(r as TrustScoreRow))
  }

  async upsert(data: {
    fromClawId: string
    toClawId: string
    domain: string
    qScore?: number
    hScore?: number | null
    nScore?: number
    wScore?: number
    composite?: number
  }): Promise<TrustScoreRecord> {
    const payload: Record<string, unknown> = {
      from_claw_id: data.fromClawId,
      to_claw_id: data.toClawId,
      domain: data.domain,
    }
    if (data.qScore !== undefined) payload.q_score = clamp(data.qScore)
    if (data.hScore !== undefined) payload.h_score = data.hScore !== null ? clamp(data.hScore) : null
    if (data.nScore !== undefined) payload.n_score = clamp(data.nScore)
    if (data.wScore !== undefined) payload.w_score = clamp(data.wScore)
    if (data.composite !== undefined) payload.composite = clamp(data.composite)

    const { data: rows, error } = await this.supabase
      .from('trust_scores')
      .upsert(payload, { onConflict: 'from_claw_id,to_claw_id,domain' })
      .select('*')

    if (error) {
      throw new Error(`Failed to upsert trust score: ${error.message}`)
    }

    const row = Array.isArray(rows) ? rows[0] : rows
    return rowToRecord(row as TrustScoreRow)
  }

  async updateQScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    delta: number,
  ): Promise<void> {
    // Supabase doesn't support atomic delta updates easily, so we read-modify-write
    const existing = await this.get(fromClawId, toClawId, domain)
    if (!existing) return

    const newQ = clamp(existing.qScore + delta)
    const { error } = await this.supabase
      .from('trust_scores')
      .update({ q_score: newQ })
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)

    if (error) {
      throw new Error(`Failed to update q_score: ${error.message}`)
    }
  }

  async updateHScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number | null,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trust_scores')
      .update({ h_score: score !== null ? clamp(score) : null })
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)

    if (error) {
      throw new Error(`Failed to update h_score: ${error.message}`)
    }
  }

  async updateNScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trust_scores')
      .update({ n_score: clamp(score) })
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)

    if (error) {
      throw new Error(`Failed to update n_score: ${error.message}`)
    }
  }

  async updateWScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trust_scores')
      .update({ w_score: clamp(score) })
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)

    if (error) {
      throw new Error(`Failed to update w_score: ${error.message}`)
    }
  }

  async updateComposite(
    fromClawId: string,
    toClawId: string,
    domain: string,
    composite: number,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trust_scores')
      .update({ composite: clamp(composite) })
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .eq('domain', domain)

    if (error) {
      throw new Error(`Failed to update composite: ${error.message}`)
    }
  }

  async decayAllQ(decayRate: number, fromClawId?: string): Promise<number> {
    // Supabase doesn't support atomic multiplication in REST API directly.
    // Fetch all records, compute new values, batch-update.
    let query = this.supabase.from('trust_scores').select('id, q_score, from_claw_id')
    if (fromClawId !== undefined) {
      query = query.eq('from_claw_id', fromClawId)
    }

    const { data: rows, error } = await query
    if (error) {
      throw new Error(`Failed to fetch records for decay: ${error.message}`)
    }

    if (!rows || rows.length === 0) return 0

    const updates = (rows as Array<{ id: string; q_score: number }>).map((r) => ({
      id: r.id,
      q_score: clamp(r.q_score * decayRate),
    }))

    const { error: updateError } = await this.supabase
      .from('trust_scores')
      .upsert(updates, { onConflict: 'id' })

    if (updateError) {
      throw new Error(`Failed to decay q_scores: ${updateError.message}`)
    }

    return rows.length
  }

  async initialize(fromClawId: string, toClawId: string): Promise<void> {
    // Use upsert with ignoreDuplicates to be idempotent
    const { error } = await this.supabase
      .from('trust_scores')
      .upsert(
        {
          from_claw_id: fromClawId,
          to_claw_id: toClawId,
          domain: '_overall',
        },
        { onConflict: 'from_claw_id,to_claw_id,domain', ignoreDuplicates: true },
      )

    if (error) {
      throw new Error(`Failed to initialize trust record: ${error.message}`)
    }
  }

  async delete(fromClawId: string, toClawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('trust_scores')
      .delete()
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)

    if (error) {
      throw new Error(`Failed to delete trust records: ${error.message}`)
    }
  }

  async getTopDomains(
    fromClawId: string,
    toClawId: string,
    limit: number = 5,
  ): Promise<TrustScoreRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('trust_scores')
      .select('*')
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .order('composite', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get top domains: ${error.message}`)
    }
    return (rows ?? []).map((r) => rowToRecord(r as TrustScoreRow))
  }
}
