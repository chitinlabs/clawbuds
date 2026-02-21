/**
 * Supabase ThreadRepository 实现（Phase 8）
 * 处理 threads_v5 + thread_participants 数据访问
 * 注意：Supabase 中 threads_v5.id 是 UUID，FK to claws 使用 TEXT (claw_id)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IThreadRepository,
  ThreadRecord,
  ThreadParticipantRecord,
  ThreadPurpose,
  ThreadStatus,
} from '../interfaces/thread.repository.interface.js'

interface ThreadRow {
  id: string
  creator_id: string
  purpose: string
  title: string
  status: string
  created_at: string
  updated_at: string
}

interface ParticipantRow {
  thread_id: string
  claw_id: string
  joined_at: string
}

function mapThread(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    creatorId: row.creator_id,
    purpose: row.purpose as ThreadPurpose,
    title: row.title,
    status: row.status as ThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapParticipant(row: ParticipantRow): ThreadParticipantRecord {
  return {
    threadId: row.thread_id,
    clawId: row.claw_id,
    joinedAt: row.joined_at,
  }
}

export class SupabaseThreadRepository implements IThreadRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: {
    id: string
    creatorId: string
    purpose: ThreadPurpose
    title: string
  }): Promise<ThreadRecord> {
    // Supabase threads_v5.id 是 UUID，不接受 grp_ 等格式
    const { data: row, error } = await this.supabase
      .from('threads_v5')
      .insert({
        id: data.id,
        creator_id: data.creatorId,
        purpose: data.purpose,
        title: data.title,
      })
      .select()
      .single()

    if (error) throw error
    return mapThread(row as ThreadRow)
  }

  async findById(id: string): Promise<ThreadRecord | null> {
    const { data: row, error } = await this.supabase
      .from('threads_v5')
      .select()
      .eq('id', id)
      .single()

    if (error?.code === 'PGRST116' || error?.code === '22P02') return null
    if (error) throw error
    return mapThread(row as ThreadRow)
  }

  async findByParticipant(
    clawId: string,
    filters?: {
      status?: ThreadStatus
      purpose?: ThreadPurpose
      limit?: number
      offset?: number
    },
  ): Promise<ThreadRecord[]> {
    let query = this.supabase
      .from('threads_v5')
      .select('*, thread_participants!inner(claw_id)')
      .eq('thread_participants.claw_id', clawId)
      .order('updated_at', { ascending: false })

    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.purpose) query = query.eq('purpose', filters.purpose)
    if (filters?.limit !== undefined) query = query.limit(filters.limit)
    if (filters?.offset !== undefined) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1)

    const { data: rows, error } = await query
    if (error) throw error
    return (rows as ThreadRow[]).map(mapThread)
  }

  async updateStatus(id: string, status: ThreadStatus): Promise<void> {
    const { error } = await this.supabase
      .from('threads_v5')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  }

  async touch(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('threads_v5')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  }

  async addParticipant(threadId: string, clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('thread_participants')
      .upsert({ thread_id: threadId, claw_id: clawId }, { onConflict: 'thread_id,claw_id' })

    if (error) throw error
  }

  async removeParticipant(threadId: string, clawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('thread_participants')
      .delete()
      .eq('thread_id', threadId)
      .eq('claw_id', clawId)

    if (error) throw error
  }

  async isParticipant(threadId: string, clawId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('thread_participants')
      .select('claw_id')
      .eq('thread_id', threadId)
      .eq('claw_id', clawId)
      .single()

    if (error?.code === 'PGRST116') return false
    if (error) throw error
    return data !== null
  }

  async getParticipants(threadId: string): Promise<ThreadParticipantRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('thread_participants')
      .select()
      .eq('thread_id', threadId)

    if (error) throw error
    return (rows as ParticipantRow[]).map(mapParticipant)
  }

  async getContributionCount(threadId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('thread_contributions')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', threadId)

    if (error) throw error
    return count ?? 0
  }
}
