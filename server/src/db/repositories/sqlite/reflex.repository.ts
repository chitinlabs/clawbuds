/**
 * SQLite ReflexRepository Implementation (Phase 4)
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  IReflexRepository,
  ReflexRecord,
  TriggerLayer,
  ValueLayer,
  ReflexBehavior,
  ReflexSource,
} from '../interfaces/reflex.repository.interface.js'

interface ReflexRow {
  id: string
  claw_id: string
  name: string
  value_layer: string
  behavior: string
  trigger_layer: number
  trigger_config: string    // JSON TEXT
  enabled: number           // SQLite: 1=true, 0=false
  confidence: number
  source: string
  created_at: string
  updated_at: string
}

function rowToRecord(row: ReflexRow): ReflexRecord {
  return {
    id: row.id,
    clawId: row.claw_id,
    name: row.name,
    valueLayer: row.value_layer as ValueLayer,
    behavior: row.behavior as ReflexBehavior,
    triggerLayer: row.trigger_layer as TriggerLayer,
    triggerConfig: JSON.parse(row.trigger_config) as Record<string, unknown>,
    enabled: row.enabled === 1,
    confidence: row.confidence,
    source: row.source as ReflexSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SQLiteReflexRepository implements IReflexRepository {
  constructor(private db: Database.Database) {}

  async create(data: {
    id: string
    clawId: string
    name: string
    valueLayer: ValueLayer
    behavior: ReflexBehavior
    triggerLayer: TriggerLayer
    triggerConfig: Record<string, unknown>
    enabled: boolean
    confidence: number
    source: ReflexSource
  }): Promise<ReflexRecord> {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer,
           trigger_config, enabled, confidence, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.clawId,
        data.name,
        data.valueLayer,
        data.behavior,
        data.triggerLayer,
        JSON.stringify(data.triggerConfig),
        data.enabled ? 1 : 0,
        data.confidence,
        data.source,
        now,
        now,
      )
    const row = this.db.prepare(`SELECT * FROM reflexes WHERE id = ?`).get(data.id) as ReflexRow
    return rowToRecord(row)
  }

  async findByName(clawId: string, name: string): Promise<ReflexRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM reflexes WHERE claw_id = ? AND name = ?`)
      .get(clawId, name) as ReflexRow | undefined
    return row ? rowToRecord(row) : null
  }

  async findEnabled(clawId: string, triggerLayer?: TriggerLayer): Promise<ReflexRecord[]> {
    let sql = `SELECT * FROM reflexes WHERE claw_id = ? AND enabled = 1`
    const params: unknown[] = [clawId]
    if (triggerLayer !== undefined) {
      sql += ` AND trigger_layer = ?`
      params.push(triggerLayer)
    }
    sql += ` ORDER BY created_at ASC`
    const rows = this.db.prepare(sql).all(...params) as ReflexRow[]
    return rows.map(rowToRecord)
  }

  async findAll(clawId: string): Promise<ReflexRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM reflexes WHERE claw_id = ? ORDER BY created_at ASC`)
      .all(clawId) as ReflexRow[]
    return rows.map(rowToRecord)
  }

  async setEnabled(clawId: string, name: string, enabled: boolean): Promise<void> {
    this.db
      .prepare(
        `UPDATE reflexes SET enabled = ?, updated_at = ? WHERE claw_id = ? AND name = ?`,
      )
      .run(enabled ? 1 : 0, new Date().toISOString(), clawId, name)
  }

  async updateConfidence(clawId: string, name: string, confidence: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE reflexes SET confidence = ?, updated_at = ? WHERE claw_id = ? AND name = ?`,
      )
      .run(confidence, new Date().toISOString(), clawId, name)
  }

  async updateConfig(
    clawId: string,
    name: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE reflexes SET trigger_config = ?, updated_at = ? WHERE claw_id = ? AND name = ?`,
      )
      .run(JSON.stringify(config), new Date().toISOString(), clawId, name)
  }

  async upsertBuiltins(
    clawId: string,
    builtins: Array<Omit<ReflexRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(
      `INSERT INTO reflexes (id, claw_id, name, value_layer, behavior, trigger_layer,
         trigger_config, enabled, confidence, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(claw_id, name) DO UPDATE SET
         value_layer = excluded.value_layer,
         behavior = excluded.behavior,
         trigger_layer = excluded.trigger_layer,
         trigger_config = excluded.trigger_config,
         confidence = excluded.confidence,
         source = excluded.source,
         updated_at = excluded.updated_at`,
    )
    const insertMany = this.db.transaction(() => {
      for (const b of builtins) {
        stmt.run(
          randomUUID(),
          clawId,
          b.name,
          b.valueLayer,
          b.behavior,
          b.triggerLayer,
          JSON.stringify(b.triggerConfig),
          b.enabled ? 1 : 0,
          b.confidence,
          b.source,
          now,
          now,
        )
      }
    })
    insertMany()
  }
}
