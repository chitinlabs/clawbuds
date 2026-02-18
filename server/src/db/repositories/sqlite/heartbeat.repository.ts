/**
 * SQLite Heartbeat Repository Implementation
 * 基于 better-sqlite3 的心跳数据访问实现
 */

import type Database from 'better-sqlite3'
import type { IHeartbeatRepository, HeartbeatRecord } from '../interfaces/heartbeat.repository.interface.js'
import { randomUUID } from 'node:crypto'

interface HeartbeatRow {
  id: string
  from_claw_id: string
  to_claw_id: string
  interests: string | null
  availability: string | null
  recent_topics: string | null
  is_keepalive: number
  created_at: string
}

function rowToRecord(row: HeartbeatRow): HeartbeatRecord {
  return {
    id: row.id,
    fromClawId: row.from_claw_id,
    toClawId: row.to_claw_id,
    interests: row.interests ? (JSON.parse(row.interests) as string[]) : undefined,
    availability: row.availability ?? undefined,
    recentTopics: row.recent_topics ?? undefined,
    isKeepalive: row.is_keepalive === 1,
    createdAt: row.created_at,
  }
}

export class SQLiteHeartbeatRepository implements IHeartbeatRepository {
  constructor(private db: Database.Database) {}

  async create(heartbeat: {
    id: string
    fromClawId: string
    toClawId: string
    interests?: string[]
    availability?: string
    recentTopics?: string
    isKeepalive: boolean
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO heartbeats (id, from_claw_id, to_claw_id, interests, availability, recent_topics, is_keepalive, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      )
      .run(
        heartbeat.id,
        heartbeat.fromClawId,
        heartbeat.toClawId,
        heartbeat.interests ? JSON.stringify(heartbeat.interests) : null,
        heartbeat.availability ?? null,
        heartbeat.recentTopics ?? null,
        heartbeat.isKeepalive ? 1 : 0,
      )
  }

  async getLatest(fromClawId: string, toClawId: string): Promise<HeartbeatRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM heartbeats
         WHERE from_claw_id = ? AND to_claw_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(fromClawId, toClawId) as HeartbeatRow | undefined

    return row ? rowToRecord(row) : null
  }

  async getLatestForClaw(toClawId: string): Promise<HeartbeatRecord[]> {
    // 每个发送方只取最新一条（使用 GROUP BY + MAX）
    const rows = this.db
      .prepare(
        `SELECT h.*
         FROM heartbeats h
         INNER JOIN (
           SELECT from_claw_id, MAX(created_at) AS max_at
           FROM heartbeats
           WHERE to_claw_id = ?
           GROUP BY from_claw_id
         ) latest
         ON h.from_claw_id = latest.from_claw_id
            AND h.created_at = latest.max_at
            AND h.to_claw_id = ?`,
      )
      .all(toClawId, toClawId) as HeartbeatRow[]

    return rows.map(rowToRecord)
  }

  async getSince(toClawId: string, since: string): Promise<HeartbeatRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM heartbeats
         WHERE to_claw_id = ? AND created_at > ?
         ORDER BY created_at DESC`,
      )
      .all(toClawId, since) as HeartbeatRow[]

    return rows.map(rowToRecord)
  }

  async deleteOlderThan(cutoffDate: string): Promise<number> {
    const result = this.db
      .prepare(`DELETE FROM heartbeats WHERE created_at < ?`)
      .run(cutoffDate)

    return result.changes
  }
}
