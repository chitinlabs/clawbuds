/**
 * Supabase ClawConfigRepository（Phase 11B T8）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ClawConfigRecord,
  UpdateClawConfigData,
  IClawConfigRepository,
} from '../interfaces/claw-config.repository.interface.js'
import { DEFAULT_CLAW_CONFIG } from '../interfaces/claw-config.repository.interface.js'

interface ClawConfigRow {
  claw_id: string
  max_messages_per_hour: number
  max_pearls_per_day: number
  briefing_cron: string
  updated_at: string
}

function rowToRecord(row: ClawConfigRow): ClawConfigRecord {
  return {
    clawId: row.claw_id,
    maxMessagesPerHour: row.max_messages_per_hour,
    maxPearlsPerDay: row.max_pearls_per_day,
    briefingCron: row.briefing_cron,
    updatedAt: row.updated_at,
  }
}

/** True when the error indicates the table is missing (not yet migrated) */
function isTableMissing(code: string | undefined, msg: string | undefined): boolean {
  const m = msg ?? ''
  const c = code ?? ''
  return (
    c === '42P01' ||
    c === 'PGRST200' ||
    m.includes('does not exist') ||
    m.includes('Could not find the table')
  )
}

export class SupabaseClawConfigRepository implements IClawConfigRepository {
  constructor(private client: SupabaseClient) {}

  async getConfig(clawId: string): Promise<ClawConfigRecord> {
    const defaults = (): ClawConfigRecord => ({ clawId, ...DEFAULT_CLAW_CONFIG, updatedAt: new Date().toISOString() })

    const { data, error } = await this.client
      .from('claw_config')
      .select('*')
      .eq('claw_id', clawId)
      .single()

    if (error) {
      // PGRST116: row not found (normal – claw has no config yet)
      // 42P01 / PGRST200 / schema cache miss: migration not yet applied
      if (error.code === 'PGRST116' || isTableMissing(error.code, error.message)) {
        return defaults()
      }
      throw new Error(`Failed to get claw config: ${error.message}`)
    }
    return rowToRecord(data as ClawConfigRow)
  }

  async updateConfig(clawId: string, data: UpdateClawConfigData): Promise<ClawConfigRecord> {
    const existing = await this.getConfig(clawId)
    const payload = {
      claw_id: clawId,
      max_messages_per_hour: data.maxMessagesPerHour ?? existing.maxMessagesPerHour,
      max_pearls_per_day: data.maxPearlsPerDay ?? existing.maxPearlsPerDay,
      briefing_cron: data.briefingCron ?? existing.briefingCron,
      updated_at: new Date().toISOString(),
    }

    const { data: rows, error } = await this.client
      .from('claw_config')
      .upsert(payload)
      .select()

    if (error) {
      if (isTableMissing(error.code, error.message)) {
        return {
          clawId,
          maxMessagesPerHour: payload.max_messages_per_hour,
          maxPearlsPerDay: payload.max_pearls_per_day,
          briefingCron: payload.briefing_cron,
          updatedAt: payload.updated_at,
        }
      }
      throw new Error(`Failed to update claw config: ${error.message}`)
    }
    if (!rows || (rows as ClawConfigRow[]).length === 0) {
      return {
        clawId,
        maxMessagesPerHour: payload.max_messages_per_hour,
        maxPearlsPerDay: payload.max_pearls_per_day,
        briefingCron: payload.briefing_cron,
        updatedAt: payload.updated_at,
      }
    }
    return rowToRecord((rows as ClawConfigRow[])[0])
  }
}
