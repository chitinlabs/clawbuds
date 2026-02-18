/**
 * SQLite FriendModel Repository Implementation
 * 好友心智模型数据访问实现（Phase 2）
 */

import type Database from 'better-sqlite3'
import type {
  IFriendModelRepository,
  FriendModelRecord,
} from '../interfaces/friend-model.repository.interface.js'

interface FriendModelRow {
  claw_id: string
  friend_id: string
  last_known_state: string | null
  inferred_interests: string   // JSON array stored as TEXT
  expertise_tags: string       // JSON object stored as TEXT
  last_heartbeat_at: string | null
  last_interaction_at: string | null
  inferred_needs: string | null  // JSON array stored as TEXT
  emotional_tone: string | null
  knowledge_gaps: string | null  // JSON array stored as TEXT
  updated_at: string
}

function rowToRecord(row: FriendModelRow): FriendModelRecord {
  return {
    clawId: row.claw_id,
    friendId: row.friend_id,
    lastKnownState: row.last_known_state,
    inferredInterests: row.inferred_interests ? JSON.parse(row.inferred_interests) : [],
    expertiseTags: row.expertise_tags ? JSON.parse(row.expertise_tags) : {},
    lastHeartbeatAt: row.last_heartbeat_at,
    lastInteractionAt: row.last_interaction_at,
    inferredNeeds: row.inferred_needs ? JSON.parse(row.inferred_needs) : null,
    emotionalTone: row.emotional_tone,
    knowledgeGaps: row.knowledge_gaps ? JSON.parse(row.knowledge_gaps) : null,
    updatedAt: row.updated_at,
  }
}

export class SQLiteFriendModelRepository implements IFriendModelRepository {
  constructor(private db: Database.Database) {}

  async get(clawId: string, friendId: string): Promise<FriendModelRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM friend_models WHERE claw_id = ? AND friend_id = ?`)
      .get(clawId, friendId) as FriendModelRow | undefined

    return row ? rowToRecord(row) : null
  }

  async getAll(clawId: string): Promise<FriendModelRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM friend_models WHERE claw_id = ? ORDER BY updated_at DESC`
      )
      .all(clawId) as FriendModelRow[]

    return rows.map(rowToRecord)
  }

  async create(record: { clawId: string; friendId: string }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO friend_models (claw_id, friend_id)
         VALUES (?, ?)
         ON CONFLICT DO NOTHING`
      )
      .run(record.clawId, record.friendId)
  }

  async updateFromHeartbeat(
    clawId: string,
    friendId: string,
    data: {
      inferredInterests: string[]
      expertiseTags: Record<string, number>
      lastKnownState?: string
      lastHeartbeatAt: string
    }
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE friend_models SET
           inferred_interests = ?,
           expertise_tags = ?,
           last_known_state = CASE WHEN ? IS NOT NULL THEN ? ELSE last_known_state END,
           last_heartbeat_at = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ? AND friend_id = ?`
      )
      .run(
        JSON.stringify(data.inferredInterests),
        JSON.stringify(data.expertiseTags),
        data.lastKnownState ?? null,
        data.lastKnownState ?? null,
        data.lastHeartbeatAt,
        clawId,
        friendId
      )
  }

  async touchInteraction(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE friend_models SET
           last_interaction_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ? AND friend_id = ?`
      )
      .run(clawId, friendId)
  }

  async updateLayer1Fields(
    clawId: string,
    friendId: string,
    data: {
      inferredNeeds?: string[]
      emotionalTone?: string
      knowledgeGaps?: string[]
    }
  ): Promise<void> {
    const updates: string[] = []
    const params: unknown[] = []

    if (data.inferredNeeds !== undefined) {
      updates.push('inferred_needs = ?')
      params.push(JSON.stringify(data.inferredNeeds))
    }
    if (data.emotionalTone !== undefined) {
      updates.push('emotional_tone = ?')
      params.push(data.emotionalTone)
    }
    if (data.knowledgeGaps !== undefined) {
      updates.push('knowledge_gaps = ?')
      params.push(JSON.stringify(data.knowledgeGaps))
    }

    if (updates.length === 0) return

    updates.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    params.push(clawId, friendId)

    this.db
      .prepare(`UPDATE friend_models SET ${updates.join(', ')} WHERE claw_id = ? AND friend_id = ?`)
      .run(...params)
  }

  async delete(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM friend_models WHERE claw_id = ? AND friend_id = ?`)
      .run(clawId, friendId)
  }
}
