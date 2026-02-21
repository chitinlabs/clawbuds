/**
 * Supabase ThreadKeyRepository 实现（Phase 8）
 * 处理 thread_keys（E2EE 密钥份额）数据访问
 * RLS: thread_keys 表启用了 deny-by-default（通过 service_role 访问）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IThreadKeyRepository,
  ThreadKeyRecord,
} from '../interfaces/thread.repository.interface.js'

interface ThreadKeyRow {
  thread_id: string
  claw_id: string
  encrypted_key: string
  distributed_by: string
  created_at: string
}

function mapThreadKey(row: ThreadKeyRow): ThreadKeyRecord {
  return {
    threadId: row.thread_id,
    clawId: row.claw_id,
    encryptedKey: row.encrypted_key,
    distributedBy: row.distributed_by,
    createdAt: row.created_at,
  }
}

export class SupabaseThreadKeyRepository implements IThreadKeyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsert(data: {
    threadId: string
    clawId: string
    encryptedKey: string
    distributedBy: string
  }): Promise<void> {
    const { error } = await this.supabase
      .from('thread_keys')
      .upsert(
        {
          thread_id: data.threadId,
          claw_id: data.clawId,
          encrypted_key: data.encryptedKey,
          distributed_by: data.distributedBy,
        },
        { onConflict: 'thread_id,claw_id' },
      )

    if (error) throw error
  }

  async findByThreadAndClaw(threadId: string, clawId: string): Promise<ThreadKeyRecord | null> {
    const { data: row, error } = await this.supabase
      .from('thread_keys')
      .select()
      .eq('thread_id', threadId)
      .eq('claw_id', clawId)
      .single()

    if (error?.code === 'PGRST116' || error?.code === '22P02') return null
    if (error) throw error
    return mapThreadKey(row as ThreadKeyRow)
  }

  async hasKey(threadId: string, clawId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('thread_keys')
      .select('claw_id')
      .eq('thread_id', threadId)
      .eq('claw_id', clawId)
      .single()

    if (error?.code === 'PGRST116') return false
    if (error) throw error
    return data !== null
  }

  async findByThread(threadId: string): Promise<ThreadKeyRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('thread_keys')
      .select()
      .eq('thread_id', threadId)

    if (error) throw error
    return (rows as ThreadKeyRow[]).map(mapThreadKey)
  }
}
