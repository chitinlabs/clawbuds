/**
 * Supabase ImprintRepository（Phase 5）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Imprint, IImprintRepository } from '../interfaces/imprint.repository.interface.js'

function nanoid(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10)
}

interface ImprintRow {
  id: string
  claw_id: string
  friend_id: string
  event_type: string
  summary: string
  source_heartbeat_id: string | null
  detected_at: string
}

function rowToImprint(row: ImprintRow): Imprint {
  return {
    id: row.id,
    clawId: row.claw_id,
    friendId: row.friend_id,
    eventType: row.event_type as Imprint['eventType'],
    summary: row.summary,
    sourceHeartbeatId: row.source_heartbeat_id ?? undefined,
    detectedAt: row.detected_at,
  }
}

export class SupabaseImprintRepository implements IImprintRepository {
  constructor(private client: SupabaseClient) {}

  async create(data: Omit<Imprint, 'id'>): Promise<Imprint> {
    const id = `imp_${nanoid()}`
    const { data: rows, error } = await this.client
      .from('imprints')
      .insert({
        id,
        claw_id: data.clawId,
        friend_id: data.friendId,
        event_type: data.eventType,
        summary: data.summary,
        source_heartbeat_id: data.sourceHeartbeatId ?? null,
        detected_at: data.detectedAt,
      })
      .select()
    if (error) throw new Error(error.message)
    return rowToImprint((rows as ImprintRow[])[0])
  }

  async findByClawAndFriend(clawId: string, friendId: string, limit = 20): Promise<Imprint[]> {
    const { data, error } = await this.client
      .from('imprints')
      .select('*')
      .eq('claw_id', clawId)
      .eq('friend_id', friendId)
      .order('detected_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return (data as ImprintRow[]).map(rowToImprint)
  }

  async findRecentByClaw(clawId: string, since: string): Promise<Imprint[]> {
    const { data, error } = await this.client
      .from('imprints')
      .select('*')
      .eq('claw_id', clawId)
      .gte('detected_at', since)
      .order('detected_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as ImprintRow[]).map(rowToImprint)
  }
}
