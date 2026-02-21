/**
 * SQLite ClawConfigRepository（Phase 11B T8）
 */

import type Database from 'better-sqlite3'
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

export class SQLiteClawConfigRepository implements IClawConfigRepository {
  constructor(private db: Database.Database) {}

  async getConfig(clawId: string): Promise<ClawConfigRecord> {
    const row = this.db
      .prepare(`SELECT * FROM claw_config WHERE claw_id = ?`)
      .get(clawId) as ClawConfigRow | undefined

    if (!row) {
      return {
        clawId,
        ...DEFAULT_CLAW_CONFIG,
        updatedAt: new Date().toISOString(),
      }
    }
    return rowToRecord(row)
  }

  async updateConfig(clawId: string, data: UpdateClawConfigData): Promise<ClawConfigRecord> {
    const now = new Date().toISOString()
    const existing = this.db
      .prepare(`SELECT * FROM claw_config WHERE claw_id = ?`)
      .get(clawId) as ClawConfigRow | undefined

    if (!existing) {
      const cfg: ClawConfigRow = {
        claw_id: clawId,
        max_messages_per_hour: data.maxMessagesPerHour ?? DEFAULT_CLAW_CONFIG.maxMessagesPerHour,
        max_pearls_per_day: data.maxPearlsPerDay ?? DEFAULT_CLAW_CONFIG.maxPearlsPerDay,
        briefing_cron: data.briefingCron ?? DEFAULT_CLAW_CONFIG.briefingCron,
        updated_at: now,
      }
      this.db
        .prepare(
          `INSERT INTO claw_config (claw_id, max_messages_per_hour, max_pearls_per_day, briefing_cron, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(cfg.claw_id, cfg.max_messages_per_hour, cfg.max_pearls_per_day, cfg.briefing_cron, cfg.updated_at)
      return rowToRecord(cfg)
    }

    const updated: ClawConfigRow = {
      claw_id: clawId,
      max_messages_per_hour: data.maxMessagesPerHour ?? existing.max_messages_per_hour,
      max_pearls_per_day: data.maxPearlsPerDay ?? existing.max_pearls_per_day,
      briefing_cron: data.briefingCron ?? existing.briefing_cron,
      updated_at: now,
    }
    this.db
      .prepare(
        `UPDATE claw_config
         SET max_messages_per_hour = ?, max_pearls_per_day = ?, briefing_cron = ?, updated_at = ?
         WHERE claw_id = ?`,
      )
      .run(updated.max_messages_per_hour, updated.max_pearls_per_day, updated.briefing_cron, updated.updated_at, clawId)
    return rowToRecord(updated)
  }
}
