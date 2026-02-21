/**
 * SQLite Trust Repository Implementation (Phase 7)
 * 五维信任模型数据访问层
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  ITrustRepository,
  TrustScoreRecord,
} from '../interfaces/trust.repository.interface.js'

interface TrustScoreRow {
  id: string
  from_claw_id: string
  to_claw_id: string
  domain: string
  q_score: number
  h_score: number | null
  n_score: number
  w_score: number
  composite: number
  updated_at: string
}

function rowToRecord(row: TrustScoreRow): TrustScoreRecord {
  return {
    id: row.id,
    fromClawId: row.from_claw_id,
    toClawId: row.to_claw_id,
    domain: row.domain,
    qScore: row.q_score,
    hScore: row.h_score,
    nScore: row.n_score,
    wScore: row.w_score,
    composite: row.composite,
    updatedAt: row.updated_at,
  }
}

function clamp(val: number): number {
  return Math.max(0.0, Math.min(1.0, val))
}

export class SQLiteTrustRepository implements ITrustRepository {
  constructor(private db: Database.Database) {}

  async get(
    fromClawId: string,
    toClawId: string,
    domain: string,
  ): Promise<TrustScoreRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM trust_scores
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .get(fromClawId, toClawId, domain) as TrustScoreRow | undefined
    return row ? rowToRecord(row) : null
  }

  async getAllDomains(fromClawId: string, toClawId: string): Promise<TrustScoreRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM trust_scores
         WHERE from_claw_id = ? AND to_claw_id = ?
         ORDER BY domain`,
      )
      .all(fromClawId, toClawId) as TrustScoreRow[]
    return rows.map(rowToRecord)
  }

  async getAllForClaw(fromClawId: string, domain?: string): Promise<TrustScoreRecord[]> {
    let rows: TrustScoreRow[]
    if (domain !== undefined) {
      rows = this.db
        .prepare(
          `SELECT * FROM trust_scores
           WHERE from_claw_id = ? AND domain = ?
           ORDER BY composite DESC`,
        )
        .all(fromClawId, domain) as TrustScoreRow[]
    } else {
      rows = this.db
        .prepare(
          `SELECT * FROM trust_scores
           WHERE from_claw_id = ?
           ORDER BY composite DESC`,
        )
        .all(fromClawId) as TrustScoreRow[]
    }
    return rows.map(rowToRecord)
  }

  async upsert(data: {
    fromClawId: string
    toClawId: string
    domain: string
    qScore?: number
    hScore?: number | null
    nScore?: number
    wScore?: number
    composite?: number
  }): Promise<TrustScoreRecord> {
    const existing = await this.get(data.fromClawId, data.toClawId, data.domain)

    if (existing) {
      // Update only provided fields
      const qScore = data.qScore !== undefined ? data.qScore : existing.qScore
      const hScore = data.hScore !== undefined ? data.hScore : existing.hScore
      const nScore = data.nScore !== undefined ? data.nScore : existing.nScore
      const wScore = data.wScore !== undefined ? data.wScore : existing.wScore
      const composite = data.composite !== undefined ? data.composite : existing.composite

      this.db
        .prepare(
          `UPDATE trust_scores
           SET q_score = ?, h_score = ?, n_score = ?, w_score = ?, composite = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
        )
        .run(qScore, hScore, nScore, wScore, composite, data.fromClawId, data.toClawId, data.domain)
    } else {
      const id = `trust_${randomUUID().replace(/-/g, '').slice(0, 16)}`
      const qScore = data.qScore ?? 0.5
      const hScore = data.hScore !== undefined ? data.hScore : null
      const nScore = data.nScore ?? 0.5
      const wScore = data.wScore ?? 0.0
      const composite = data.composite ?? 0.5

      this.db
        .prepare(
          `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain, q_score, h_score, n_score, w_score, composite)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, data.fromClawId, data.toClawId, data.domain, qScore, hScore, nScore, wScore, composite)
    }

    return (await this.get(data.fromClawId, data.toClawId, data.domain))!
  }

  async updateQScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    delta: number,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE trust_scores
         SET q_score = MAX(0.0, MIN(1.0, q_score + ?)),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .run(delta, fromClawId, toClawId, domain)
  }

  async updateHScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number | null,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE trust_scores
         SET h_score = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .run(score, fromClawId, toClawId, domain)
  }

  async updateNScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE trust_scores
         SET n_score = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .run(clamp(score), fromClawId, toClawId, domain)
  }

  async updateWScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE trust_scores
         SET w_score = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .run(clamp(score), fromClawId, toClawId, domain)
  }

  async updateComposite(
    fromClawId: string,
    toClawId: string,
    domain: string,
    composite: number,
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE trust_scores
         SET composite = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE from_claw_id = ? AND to_claw_id = ? AND domain = ?`,
      )
      .run(clamp(composite), fromClawId, toClawId, domain)
  }

  async decayAllQ(decayRate: number, fromClawId?: string): Promise<number> {
    let result: { changes: number }
    if (fromClawId !== undefined) {
      result = this.db
        .prepare(
          `UPDATE trust_scores
           SET q_score = MAX(0.0, MIN(1.0, q_score * ?)),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE from_claw_id = ?`,
        )
        .run(decayRate, fromClawId) as { changes: number }
    } else {
      result = this.db
        .prepare(
          `UPDATE trust_scores
           SET q_score = MAX(0.0, MIN(1.0, q_score * ?)),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .run(decayRate) as { changes: number }
    }
    return result.changes
  }

  async initialize(fromClawId: string, toClawId: string): Promise<void> {
    const existing = await this.get(fromClawId, toClawId, '_overall')
    if (existing) return  // 幂等：已存在则跳过

    const id = `trust_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    this.db
      .prepare(
        `INSERT INTO trust_scores (id, from_claw_id, to_claw_id, domain)
         VALUES (?, ?, ?, '_overall')`,
      )
      .run(id, fromClawId, toClawId)
  }

  async delete(fromClawId: string, toClawId: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM trust_scores
         WHERE from_claw_id = ? AND to_claw_id = ?`,
      )
      .run(fromClawId, toClawId)
  }

  async getTopDomains(
    fromClawId: string,
    toClawId: string,
    limit: number = 5,
  ): Promise<TrustScoreRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM trust_scores
         WHERE from_claw_id = ? AND to_claw_id = ?
         ORDER BY composite DESC
         LIMIT ?`,
      )
      .all(fromClawId, toClawId, limit) as TrustScoreRow[]
    return rows.map(rowToRecord)
  }
}
