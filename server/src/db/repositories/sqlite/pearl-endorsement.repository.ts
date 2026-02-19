/**
 * SQLite PearlEndorsementRepository Implementation (Phase 3)
 */

import type Database from 'better-sqlite3'
import type {
  IPearlEndorsementRepository,
  PearlEndorsementRecord,
} from '../interfaces/pearl.repository.interface.js'

interface PearlEndorsementRow {
  id: string
  pearl_id: string
  endorser_claw_id: string
  score: number
  comment: string | null
  created_at: string
  updated_at: string
}

function rowToRecord(row: PearlEndorsementRow): PearlEndorsementRecord {
  return {
    id: row.id,
    pearlId: row.pearl_id,
    endorserClawId: row.endorser_claw_id,
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SQLitePearlEndorsementRepository implements IPearlEndorsementRepository {
  constructor(private db: Database.Database) {}

  async upsert(data: {
    id: string
    pearlId: string
    endorserClawId: string
    score: number
    comment?: string
  }): Promise<PearlEndorsementRecord> {
    const now = new Date().toISOString()
    // Check if an endorsement already exists for this (pearl, endorser) pair
    const existing = this.db
      .prepare(
        `SELECT id FROM pearl_endorsements WHERE pearl_id = ? AND endorser_claw_id = ?`,
      )
      .get(data.pearlId, data.endorserClawId) as { id: string } | undefined

    if (existing) {
      // Update score and comment
      this.db
        .prepare(
          `UPDATE pearl_endorsements
           SET score = ?, comment = ?, updated_at = ?
           WHERE pearl_id = ? AND endorser_claw_id = ?`,
        )
        .run(
          data.score,
          data.comment ?? null,
          now,
          data.pearlId,
          data.endorserClawId,
        )
    } else {
      // Insert new endorsement
      this.db
        .prepare(
          `INSERT INTO pearl_endorsements
             (id, pearl_id, endorser_claw_id, score, comment, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.id,
          data.pearlId,
          data.endorserClawId,
          data.score,
          data.comment ?? null,
          now,
          now,
        )
    }

    const row = this.db
      .prepare(
        `SELECT * FROM pearl_endorsements WHERE pearl_id = ? AND endorser_claw_id = ?`,
      )
      .get(data.pearlId, data.endorserClawId) as PearlEndorsementRow

    return rowToRecord(row)
  }

  async findByPearl(pearlId: string): Promise<PearlEndorsementRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM pearl_endorsements WHERE pearl_id = ? ORDER BY created_at ASC`)
      .all(pearlId) as PearlEndorsementRow[]
    return rows.map(rowToRecord)
  }

  async findOne(pearlId: string, endorserClawId: string): Promise<PearlEndorsementRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM pearl_endorsements WHERE pearl_id = ? AND endorser_claw_id = ?`,
      )
      .get(pearlId, endorserClawId) as PearlEndorsementRow | undefined
    return row ? rowToRecord(row) : null
  }

  async getScores(pearlId: string): Promise<number[]> {
    const rows = this.db
      .prepare(`SELECT score FROM pearl_endorsements WHERE pearl_id = ?`)
      .all(pearlId) as { score: number }[]
    return rows.map((r) => r.score)
  }
}
