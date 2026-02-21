/**
 * Supabase ThreadContributionRepository 实现（Phase 8）
 * 处理 thread_contributions（E2EE：只存密文 + nonce）数据访问
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IThreadContributionRepository,
  ThreadContributionRecord,
  ContributionType,
} from '../interfaces/thread.repository.interface.js'

interface ContributionRow {
  id: string
  thread_id: string
  contributor_id: string
  encrypted_content: string
  nonce: string
  content_type: string
  created_at: string
}

function mapContribution(row: ContributionRow): ThreadContributionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    contributorId: row.contributor_id,
    encryptedContent: row.encrypted_content,
    nonce: row.nonce,
    contentType: row.content_type as ContributionType,
    createdAt: row.created_at,
  }
}

export class SupabaseThreadContributionRepository implements IThreadContributionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: {
    id: string
    threadId: string
    contributorId: string
    encryptedContent: string
    nonce: string
    contentType: ContributionType
  }): Promise<ThreadContributionRecord> {
    const { data: row, error } = await this.supabase
      .from('thread_contributions')
      .insert({
        id: data.id,
        thread_id: data.threadId,
        contributor_id: data.contributorId,
        encrypted_content: data.encryptedContent,
        nonce: data.nonce,
        content_type: data.contentType,
      })
      .select()
      .single()

    if (error) throw error
    return mapContribution(row as ContributionRow)
  }

  async findByThread(
    threadId: string,
    filters?: {
      since?: string
      limit?: number
      offset?: number
    },
  ): Promise<ThreadContributionRecord[]> {
    let query = this.supabase
      .from('thread_contributions')
      .select()
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (filters?.since) query = query.gt('created_at', filters.since)
    if (filters?.limit !== undefined) query = query.limit(filters.limit)
    if (filters?.offset !== undefined) {
      const limit = filters.limit ?? 50
      query = query.range(filters.offset, filters.offset + limit - 1)
    }

    const { data: rows, error } = await query
    if (error) throw error
    return (rows as ContributionRow[]).map(mapContribution)
  }

  async countByThread(threadId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('thread_contributions')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', threadId)

    if (error) throw error
    return count ?? 0
  }

  async findByContributor(
    threadId: string,
    contributorId: string,
  ): Promise<ThreadContributionRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('thread_contributions')
      .select()
      .eq('thread_id', threadId)
      .eq('contributor_id', contributorId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (rows as ContributionRow[]).map(mapContribution)
  }
}
