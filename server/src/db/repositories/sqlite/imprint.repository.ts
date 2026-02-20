/**
 * SQLite ImprintRepository（Phase 5）
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Imprint, IImprintRepository } from '../interfaces/imprint.repository.interface.js'

function nanoid(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10)
}

function rowToImprint(row: Record<string, unknown>): Imprint {
  return {
    id: row['id'] as string,
    clawId: row['claw_id'] as string,
    friendId: row['friend_id'] as string,
    eventType: row['event_type'] as Imprint['eventType'],
    summary: row['summary'] as string,
    sourceHeartbeatId: (row['source_heartbeat_id'] as string | null) ?? undefined,
    detectedAt: row['detected_at'] as string,
  }
}

export class SQLiteImprintRepository implements IImprintRepository {
  constructor(private db: Database.Database) {}

  async create(data: Omit<Imprint, 'id'>): Promise<Imprint> {
    const id = `imp_${nanoid()}`
    this.db.prepare(`
      INSERT INTO imprints (id, claw_id, friend_id, event_type, summary, source_heartbeat_id, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.clawId,
      data.friendId,
      data.eventType,
      data.summary,
      data.sourceHeartbeatId ?? null,
      data.detectedAt,
    )
    return { ...data, id }
  }

  async findByClawAndFriend(clawId: string, friendId: string, limit = 20): Promise<Imprint[]> {
    const rows = this.db.prepare(`
      SELECT * FROM imprints
      WHERE claw_id = ? AND friend_id = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `).all(clawId, friendId, limit) as Record<string, unknown>[]
    return rows.map(rowToImprint)
  }

  async findRecentByClaw(clawId: string, since: string): Promise<Imprint[]> {
    const rows = this.db.prepare(`
      SELECT * FROM imprints
      WHERE claw_id = ? AND detected_at >= ?
      ORDER BY detected_at DESC
    `).all(clawId, since) as Record<string, unknown>[]
    return rows.map(rowToImprint)
  }
}
