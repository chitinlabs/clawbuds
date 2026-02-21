/**
 * Supabase CarapaceHistoryRepository（Phase 10）
 * carapace.md 版本历史的 Supabase 实现
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CarapaceChangeReason,
  CarapaceHistoryRecord,
  ICarapaceHistoryRepository,
} from '../interfaces/carapace-history.repository.interface.js'

interface CarapaceHistoryRow {
  id: string
  claw_id: string
  version: number
  content: string
  change_reason: string
  suggested_by: string
  created_at: string
}

function rowToRecord(row: CarapaceHistoryRow): CarapaceHistoryRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    version: row.version,
    content: row.content,
    changeReason: row.change_reason as CarapaceChangeReason,
    suggestedBy: row.suggested_by as 'system' | 'user',
    createdAt: row.created_at,
  }
}

export class SupabaseCarapaceHistoryRepository implements ICarapaceHistoryRepository {
  constructor(private client: SupabaseClient) {}

  async create(data: {
    id: string
    clawId: string
    content: string
    changeReason: CarapaceChangeReason
    suggestedBy: 'system' | 'user'
  }): Promise<CarapaceHistoryRecord> {
    const nextVersion = (await this.getLatestVersion(data.clawId)) + 1

    const { data: rows, error } = await this.client
      .from('carapace_history')
      .insert({
        id: data.id,
        claw_id: data.clawId,
        version: nextVersion,
        content: data.content,
        change_reason: data.changeReason,
        suggested_by: data.suggestedBy,
      })
      .select()

    if (error) throw new Error(error.message)

    if (rows && (rows as CarapaceHistoryRow[]).length > 0) {
      return rowToRecord((rows as CarapaceHistoryRow[])[0])
    }

    return {
      id: data.id,
      clawId: data.clawId,
      version: nextVersion,
      content: data.content,
      changeReason: data.changeReason,
      suggestedBy: data.suggestedBy,
      createdAt: new Date().toISOString(),
    }
  }

  async getLatestVersion(clawId: string): Promise<number> {
    const { data, error } = await this.client
      .from('carapace_history')
      .select('version')
      .eq('claw_id', clawId)
      .order('version', { ascending: false })
      .limit(1)

    if (error) throw new Error(error.message)
    if (!data || (data as CarapaceHistoryRow[]).length === 0) return 0
    return (data as CarapaceHistoryRow[])[0].version
  }

  async findByOwner(
    clawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<CarapaceHistoryRecord[]> {
    const limit = Math.min(filters?.limit ?? 20, 50)
    const offset = filters?.offset ?? 0

    const { data, error } = await this.client
      .from('carapace_history')
      .select('*')
      .eq('claw_id', clawId)
      .order('version', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new Error(error.message)
    return ((data ?? []) as CarapaceHistoryRow[]).map(rowToRecord)
  }

  async findByVersion(clawId: string, version: number): Promise<CarapaceHistoryRecord | null> {
    const { data, error } = await this.client
      .from('carapace_history')
      .select('*')
      .eq('claw_id', clawId)
      .eq('version', version)

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }
    if (!data || (data as CarapaceHistoryRow[]).length === 0) return null
    return rowToRecord((data as CarapaceHistoryRow[])[0])
  }

  async pruneOldVersions(clawId: string, keepCount: number): Promise<number> {
    // 先找出需要保留的最小版本号
    const { data: keepRows, error: fetchError } = await this.client
      .from('carapace_history')
      .select('version')
      .eq('claw_id', clawId)
      .order('version', { ascending: false })
      .limit(keepCount)

    if (fetchError) throw new Error(fetchError.message)
    if (!keepRows || (keepRows as CarapaceHistoryRow[]).length === 0) return 0

    const rows = keepRows as CarapaceHistoryRow[]
    const minKeptVersion = rows[rows.length - 1].version

    const { error: deleteError, count } = await this.client
      .from('carapace_history')
      .delete({ count: 'exact' })
      .eq('claw_id', clawId)
      .lt('version', minKeptVersion)

    if (deleteError) throw new Error(deleteError.message)
    return count ?? 0
  }
}
