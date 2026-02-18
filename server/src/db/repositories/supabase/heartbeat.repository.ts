/**
 * Supabase Heartbeat Repository Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IHeartbeatRepository, HeartbeatRecord } from '../interfaces/heartbeat.repository.interface.js'

interface HeartbeatRow {
  id: string
  from_claw_id: string
  to_claw_id: string
  interests: string[] | null
  availability: string | null
  recent_topics: string | null
  is_keepalive: boolean
  created_at: string
}

function rowToRecord(row: HeartbeatRow): HeartbeatRecord {
  return {
    id: row.id,
    fromClawId: row.from_claw_id,
    toClawId: row.to_claw_id,
    interests: row.interests ?? undefined,
    availability: row.availability ?? undefined,
    recentTopics: row.recent_topics ?? undefined,
    isKeepalive: row.is_keepalive,
    createdAt: row.created_at,
  }
}

export class SupabaseHeartbeatRepository implements IHeartbeatRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(heartbeat: {
    id: string
    fromClawId: string
    toClawId: string
    interests?: string[]
    availability?: string
    recentTopics?: string
    isKeepalive: boolean
  }): Promise<void> {
    const { error } = await this.supabase.from('heartbeats').insert({
      id: heartbeat.id,
      from_claw_id: heartbeat.fromClawId,
      to_claw_id: heartbeat.toClawId,
      interests: heartbeat.interests ?? null,
      availability: heartbeat.availability ?? null,
      recent_topics: heartbeat.recentTopics ?? null,
      is_keepalive: heartbeat.isKeepalive,
    })

    if (error) {
      throw new Error(`Failed to create heartbeat: ${error.message}`)
    }
  }

  async getLatest(fromClawId: string, toClawId: string): Promise<HeartbeatRecord | null> {
    const { data: row, error } = await this.supabase
      .from('heartbeats')
      .select('*')
      .eq('from_claw_id', fromClawId)
      .eq('to_claw_id', toClawId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to get latest heartbeat: ${error.message}`)
    }

    return rowToRecord(row as HeartbeatRow)
  }

  async getLatestForClaw(toClawId: string): Promise<HeartbeatRecord[]> {
    // Supabase 不支持 GROUP BY，使用 RPC 或多次查询。
    // 这里用一个简单方案：先获取所有发送方，再逐个取最新
    // 在实际 Supabase 中可以用 Postgres 视图优化，但接口语义不变
    const { data: rows, error } = await this.supabase
      .from('heartbeats')
      .select('*')
      .eq('to_claw_id', toClawId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get latest heartbeats for claw: ${error.message}`)
    }

    if (!rows || rows.length === 0) return []

    // 每个 from_claw_id 只取第一条（已按 created_at DESC 排序）
    const seen = new Set<string>()
    const latest: HeartbeatRow[] = []
    for (const row of rows as HeartbeatRow[]) {
      if (!seen.has(row.from_claw_id)) {
        seen.add(row.from_claw_id)
        latest.push(row)
      }
    }

    return latest.map(rowToRecord)
  }

  async getSince(toClawId: string, since: string): Promise<HeartbeatRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('heartbeats')
      .select('*')
      .eq('to_claw_id', toClawId)
      .gt('created_at', since)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get heartbeats since date: ${error.message}`)
    }

    return (rows as HeartbeatRow[]).map(rowToRecord)
  }

  async deleteOlderThan(cutoffDate: string): Promise<number> {
    const { error, count } = await this.supabase
      .from('heartbeats')
      .delete()
      .lt('created_at', cutoffDate)

    if (error) {
      throw new Error(`Failed to delete old heartbeats: ${error.message}`)
    }

    return count ?? 0
  }
}
