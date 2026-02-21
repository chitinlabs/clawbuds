/**
 * Supabase DraftRepository（Phase 11 T4）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DraftRecord,
  DraftStatus,
  IDraftRepository,
} from '../interfaces/draft.repository.interface.js'

interface DraftRow {
  id: string
  claw_id: string
  to_claw_id: string
  content: string
  reason: string
  status: string
  created_at: string
  expires_at: string | null
  approved_at: string | null
  rejected_at: string | null
  sent_message_id: string | null
}

function rowToRecord(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    toClawId: row.to_claw_id,
    content: row.content,
    reason: row.reason,
    status: row.status as DraftStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    sentMessageId: row.sent_message_id,
  }
}

export class SupabaseDraftRepository implements IDraftRepository {
  constructor(private client: SupabaseClient) {}

  async create(data: {
    id: string
    clawId: string
    toClawId: string
    content: string
    reason: string
    expiresAt?: string
  }): Promise<DraftRecord> {
    const { data: rows, error } = await this.client
      .from('drafts')
      .insert({
        id: data.id,
        claw_id: data.clawId,
        to_claw_id: data.toClawId,
        content: data.content,
        reason: data.reason,
        expires_at: data.expiresAt ?? null,
      })
      .select()

    if (error) throw new Error(error.message)

    if (rows && (rows as DraftRow[]).length > 0) {
      return rowToRecord((rows as DraftRow[])[0])
    }
    return {
      id: data.id, clawId: data.clawId, toClawId: data.toClawId, content: data.content,
      reason: data.reason, status: 'pending', createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt ?? null, approvedAt: null, rejectedAt: null, sentMessageId: null,
    }
  }

  async findByOwner(
    clawId: string,
    filters?: { status?: DraftStatus; limit?: number; offset?: number },
  ): Promise<DraftRecord[]> {
    const limit = Math.min(filters?.limit ?? 20, 100)
    const offset = filters?.offset ?? 0

    let query = this.client
      .from('drafts')
      .select('*')
      .eq('claw_id', clawId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return ((data ?? []) as DraftRow[]).map(rowToRecord)
  }

  async findById(id: string): Promise<DraftRecord | null> {
    const { data, error } = await this.client
      .from('drafts').select('*').eq('id', id)

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }
    if (!data || (data as DraftRow[]).length === 0) return null
    return rowToRecord((data as DraftRow[])[0])
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    meta?: { sentMessageId?: string },
  ): Promise<DraftRecord> {
    const now = new Date().toISOString()
    const { data, error } = await this.client
      .from('drafts')
      .update({
        status,
        approved_at: status === 'approved' ? now : null,
        rejected_at: status === 'rejected' ? now : null,
        sent_message_id: meta?.sentMessageId ?? null,
      })
      .eq('id', id)
      .select()

    if (error) throw new Error(error.message)
    return rowToRecord((data as DraftRow[])[0])
  }

  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString()
    const { error, count } = await this.client
      .from('drafts')
      .delete({ count: 'exact' })
      .lt('expires_at', now)
      .eq('status', 'pending')

    if (error) throw new Error(error.message)
    return count ?? 0
  }
}
