/**
 * SQLite RelationshipStrength Repository Implementation
 * 关系强度数据访问实现（Phase 1）
 */

import type Database from 'better-sqlite3'
import type {
  IRelationshipStrengthRepository,
  RelationshipStrengthRecord,
  DunbarLayer,
} from '../interfaces/relationship-strength.repository.interface.js'

interface RSRow {
  claw_id: string
  friend_id: string
  strength: number
  dunbar_layer: DunbarLayer
  manual_override: number
  last_interaction_at: string | null
  updated_at: string
}

// Dunbar 层级的强度下界（用于 at-risk 检测）
const LAYER_THRESHOLDS: Record<DunbarLayer, number> = {
  core: 0.8,
  sympathy: 0.6,
  active: 0.3,
  casual: 0.0,
}

function rowToRecord(row: RSRow): RelationshipStrengthRecord {
  return {
    clawId: row.claw_id,
    friendId: row.friend_id,
    strength: row.strength,
    dunbarLayer: row.dunbar_layer,
    manualOverride: row.manual_override === 1,
    lastInteractionAt: row.last_interaction_at,
    updatedAt: row.updated_at,
  }
}

export class SQLiteRelationshipStrengthRepository implements IRelationshipStrengthRepository {
  constructor(private db: Database.Database) {}

  async get(clawId: string, friendId: string): Promise<RelationshipStrengthRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM relationship_strength WHERE claw_id = ? AND friend_id = ?`)
      .get(clawId, friendId) as RSRow | undefined

    return row ? rowToRecord(row) : null
  }

  async getAllForClaw(clawId: string): Promise<RelationshipStrengthRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM relationship_strength WHERE claw_id = ? ORDER BY strength DESC`)
      .all(clawId) as RSRow[]

    return rows.map(rowToRecord)
  }

  async create(record: {
    clawId: string
    friendId: string
    strength: number
    dunbarLayer: DunbarLayer
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO relationship_strength (claw_id, friend_id, strength, dunbar_layer)
         VALUES (?, ?, ?, ?)`,
      )
      .run(record.clawId, record.friendId, record.strength, record.dunbarLayer)
  }

  async updateStrength(clawId: string, friendId: string, strength: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE relationship_strength
         SET strength = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ? AND friend_id = ?`,
      )
      .run(strength, clawId, friendId)
  }

  async updateLayer(
    clawId: string,
    friendId: string,
    layer: DunbarLayer,
    manualOverride: boolean,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE relationship_strength
         SET dunbar_layer = ?, manual_override = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ? AND friend_id = ?`,
      )
      .run(layer, manualOverride ? 1 : 0, clawId, friendId)
  }

  async touchInteraction(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE relationship_strength
         SET last_interaction_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ? AND friend_id = ?`,
      )
      .run(clawId, friendId)
  }

  async decayAll(computeDecayRate: (strength: number) => number): Promise<number> {
    const rows = this.db
      .prepare(`SELECT claw_id, friend_id, strength FROM relationship_strength`)
      .all() as Pick<RSRow, 'claw_id' | 'friend_id' | 'strength'>[]

    if (rows.length === 0) return 0

    const update = this.db.prepare(
      `UPDATE relationship_strength
       SET strength = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE claw_id = ? AND friend_id = ?`,
    )

    const run = this.db.transaction(() => {
      for (const row of rows) {
        const newStrength = Math.max(0.01, row.strength * computeDecayRate(row.strength))
        update.run(newStrength, row.claw_id, row.friend_id)
      }
    })
    run()

    return rows.length
  }

  async getAtRisk(
    clawId: string,
    margin: number,
    inactiveDays: number,
  ): Promise<RelationshipStrengthRecord[]> {
    // at-risk：strength 距离下一层阈值 ≤ margin 且最近 inactiveDays 天无互动
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString()

    const rows = this.db
      .prepare(
        `SELECT * FROM relationship_strength
         WHERE claw_id = ?
           AND (last_interaction_at IS NULL OR last_interaction_at < ?)`,
      )
      .all(clawId, cutoff) as RSRow[]

    return rows
      .filter((row) => {
        const threshold = LAYER_THRESHOLDS[row.dunbar_layer]
        return row.strength - threshold <= margin && row.strength > threshold
      })
      .map(rowToRecord)
  }

  async delete(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM relationship_strength WHERE claw_id = ? AND friend_id = ?`)
      .run(clawId, friendId)
  }

  async findAllOwners(): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT DISTINCT claw_id FROM relationship_strength')
      .all() as Array<{ claw_id: string }>
    return rows.map((r) => r.claw_id)
  }
}
