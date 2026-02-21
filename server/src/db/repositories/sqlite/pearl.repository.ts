/**
 * SQLite PearlRepository Implementation (Phase 3)
 * 处理 pearls / pearl_references / pearl_shares 三张表
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  IPearlRepository,
  PearlMetadataRecord,
  PearlContentRecord,
  PearlFullRecord,
  PearlReferenceRecord,
  CreatePearlData,
  UpdatePearlData,
  PearlFilters,
} from '../interfaces/pearl.repository.interface.js'

interface PearlRow {
  id: string
  owner_id: string
  type: string
  trigger_text: string
  domain_tags: string       // JSON array TEXT
  luster: number
  shareability: string
  share_conditions: string | null  // JSON object TEXT, nullable
  body: string | null
  context: string | null
  origin_type: string
  created_at: string
  updated_at: string
}

interface PearlReferenceRow {
  id: string
  pearl_id: string
  type: string
  content: string
  created_at: string
}

interface PearlShareRow {
  id: string
  pearl_id: string
  from_claw_id: string
  to_claw_id: string
  created_at: string
}

/** 安全 JSON 解析，出错时返回 fallback 而不是抛出异常 */
function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToMetadata(row: PearlRow): PearlMetadataRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type as PearlMetadataRecord['type'],
    triggerText: row.trigger_text,
    domainTags: safeParseJson<string[]>(row.domain_tags, []),
    luster: row.luster,
    shareability: row.shareability as PearlMetadataRecord['shareability'],
    shareConditions: row.share_conditions
      ? safeParseJson<Record<string, unknown> | null>(row.share_conditions, null)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToContent(row: PearlRow): PearlContentRecord {
  return {
    ...rowToMetadata(row),
    body: row.body,
    context: row.context,
    originType: row.origin_type as PearlContentRecord['originType'],
  }
}

function refRowToRecord(row: PearlReferenceRow): PearlReferenceRecord {
  return {
    id: row.id,
    pearlId: row.pearl_id,
    type: row.type as PearlReferenceRecord['type'],
    content: row.content,
    createdAt: row.created_at,
  }
}

export class SQLitePearlRepository implements IPearlRepository {
  constructor(private db: Database.Database) {}

  async create(data: CreatePearlData): Promise<PearlContentRecord> {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO pearls
           (id, owner_id, type, trigger_text, domain_tags, shareability, share_conditions,
            body, context, origin_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.ownerId,
        data.type,
        data.triggerText,
        JSON.stringify(data.domainTags),
        data.shareability,
        data.shareConditions ? JSON.stringify(data.shareConditions) : null,
        data.body ?? null,
        data.context ?? null,
        data.originType,
        now,
        now,
      )

    const row = this.db.prepare(`SELECT * FROM pearls WHERE id = ?`).get(data.id) as PearlRow
    return rowToContent(row)
  }

  async findById(
    id: string,
    level: 0 | 1 | 2,
  ): Promise<PearlMetadataRecord | PearlContentRecord | PearlFullRecord | null> {
    const row = this.db.prepare(`SELECT * FROM pearls WHERE id = ?`).get(id) as
      | PearlRow
      | undefined
    if (!row) return null

    if (level === 0) {
      return rowToMetadata(row)
    }

    if (level === 1) {
      return rowToContent(row)
    }

    // level === 2: include references
    const refRows = this.db
      .prepare(`SELECT * FROM pearl_references WHERE pearl_id = ? ORDER BY created_at ASC`)
      .all(id) as PearlReferenceRow[]

    return {
      ...rowToContent(row),
      references: refRows.map(refRowToRecord),
    }
  }

  async findAllIds(): Promise<string[]> {
    const rows = this.db.prepare('SELECT id FROM pearls').all() as Array<{ id: string }>
    return rows.map(r => r.id)
  }

  async findByOwner(ownerId: string, filters?: PearlFilters): Promise<PearlMetadataRecord[]> {
    let sql = `
      SELECT id, owner_id, type, trigger_text, domain_tags, luster,
             shareability, share_conditions, created_at, updated_at
      FROM pearls
      WHERE owner_id = ?
    `
    const params: unknown[] = [ownerId]

    if (filters?.type) {
      sql += ` AND type = ?`
      params.push(filters.type)
    }

    if (filters?.shareability) {
      sql += ` AND shareability = ?`
      params.push(filters.shareability)
    }

    if (filters?.since) {
      sql += ` AND created_at >= ?`
      params.push(filters.since)
    }

    sql += ` ORDER BY updated_at DESC`

    // OFFSET requires LIMIT in SQLite; when limit is absent use -1 (unlimited)
    if (filters?.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(filters.limit)
      if (filters?.offset !== undefined) {
        sql += ` OFFSET ?`
        params.push(filters.offset)
      }
    } else if (filters?.offset !== undefined) {
      sql += ` LIMIT -1 OFFSET ?`
      params.push(filters.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as PearlRow[]
    let records = rows.map(rowToMetadata)

    // Filter by domain tag (post-query, since tags are stored as JSON text)
    // Note: applied after LIMIT/OFFSET which may cause under-full pages when combined with domain filter
    if (filters?.domain) {
      const domain = filters.domain
      records = records.filter((r) => r.domainTags.includes(domain))
    }

    return records
  }

  async update(id: string, data: UpdatePearlData): Promise<PearlContentRecord> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (data.triggerText !== undefined) {
      sets.push('trigger_text = ?')
      params.push(data.triggerText)
    }
    if ('body' in data) {
      sets.push('body = ?')
      params.push(data.body ?? null)
    }
    if ('context' in data) {
      sets.push('context = ?')
      params.push(data.context ?? null)
    }
    if (data.domainTags !== undefined) {
      sets.push('domain_tags = ?')
      params.push(JSON.stringify(data.domainTags))
    }
    if (data.shareability !== undefined) {
      sets.push('shareability = ?')
      params.push(data.shareability)
    }
    if ('shareConditions' in data) {
      sets.push('share_conditions = ?')
      params.push(data.shareConditions ? JSON.stringify(data.shareConditions) : null)
    }

    params.push(id)
    this.db.prepare(`UPDATE pearls SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const row = this.db.prepare(`SELECT * FROM pearls WHERE id = ?`).get(id) as PearlRow | undefined
    if (!row) {
      throw new Error(`Pearl not found: ${id}`)
    }
    return rowToContent(row)
  }

  async updateLuster(id: string, luster: number): Promise<void> {
    this.db.prepare(`UPDATE pearls SET luster = ?, updated_at = ? WHERE id = ?`).run(
      luster,
      new Date().toISOString(),
      id,
    )
  }

  async delete(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM pearls WHERE id = ?`).run(id)
  }

  async getPearlDomainTags(ownerId: string, since?: Date): Promise<string[]> {
    let sql = `SELECT domain_tags FROM pearls WHERE owner_id = ?`
    const params: unknown[] = [ownerId]

    if (since) {
      sql += ` AND created_at >= ?`
      params.push(since.toISOString())
    }

    const rows = this.db.prepare(sql).all(...params) as { domain_tags: string }[]
    const tagSet = new Set<string>()
    for (const row of rows) {
      const tags = JSON.parse(row.domain_tags) as string[]
      for (const tag of tags) {
        tagSet.add(tag)
      }
    }
    return [...tagSet]
  }

  async getRoutingCandidates(ownerId: string): Promise<PearlMetadataRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, owner_id, type, trigger_text, domain_tags, luster,
                shareability, share_conditions, created_at, updated_at
         FROM pearls
         WHERE owner_id = ? AND shareability != 'private'
         ORDER BY updated_at DESC`,
      )
      .all(ownerId) as PearlRow[]
    return rows.map(rowToMetadata)
  }

  async isVisibleTo(pearlId: string, clawId: string): Promise<boolean> {
    const pearl = this.db
      .prepare(`SELECT owner_id, shareability FROM pearls WHERE id = ?`)
      .get(pearlId) as { owner_id: string; shareability: string } | undefined

    if (!pearl) return false

    // Owner can always see their pearl
    if (pearl.owner_id === clawId) return true

    // Public pearls are visible to everyone
    if (pearl.shareability === 'public') return true

    // Check if pearl was shared with this claw
    const share = this.db
      .prepare(
        `SELECT id FROM pearl_shares WHERE pearl_id = ? AND to_claw_id = ?`,
      )
      .get(pearlId, clawId)
    return !!share
  }

  async addReference(
    pearlId: string,
    data: Omit<PearlReferenceRecord, 'id' | 'pearlId' | 'createdAt'>,
  ): Promise<PearlReferenceRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO pearl_references (id, pearl_id, type, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, pearlId, data.type, data.content, now)

    return { id, pearlId, type: data.type, content: data.content, createdAt: now }
  }

  async removeReference(referenceId: string): Promise<void> {
    this.db.prepare(`DELETE FROM pearl_references WHERE id = ?`).run(referenceId)
  }

  async getReferences(pearlId: string): Promise<PearlReferenceRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM pearl_references WHERE pearl_id = ? ORDER BY created_at ASC`)
      .all(pearlId) as PearlReferenceRow[]
    return rows.map(refRowToRecord)
  }

  async createShare(data: {
    id: string
    pearlId: string
    fromClawId: string
    toClawId: string
  }): Promise<void> {
    const now = new Date().toISOString()
    // INSERT OR IGNORE: idempotent
    this.db
      .prepare(
        `INSERT OR IGNORE INTO pearl_shares
           (id, pearl_id, from_claw_id, to_claw_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(data.id, data.pearlId, data.fromClawId, data.toClawId, now)
  }

  async getReceivedPearls(
    toClawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      share: { id: string; fromClawId: string; createdAt: string }
      pearl: PearlMetadataRecord
    }>
  > {
    let sql = `
      SELECT
        ps.id as share_id, ps.from_claw_id, ps.created_at as share_created_at,
        p.id, p.owner_id, p.type, p.trigger_text, p.domain_tags, p.luster,
        p.shareability, p.share_conditions, p.created_at, p.updated_at
      FROM pearl_shares ps
      JOIN pearls p ON p.id = ps.pearl_id
      WHERE ps.to_claw_id = ?
      ORDER BY ps.created_at DESC
    `
    const params: unknown[] = [toClawId]

    if (filters?.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(filters.limit)
      if (filters?.offset !== undefined) {
        sql += ` OFFSET ?`
        params.push(filters.offset)
      }
    } else if (filters?.offset !== undefined) {
      sql += ` LIMIT -1 OFFSET ?`
      params.push(filters.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as Array<
      PearlRow & { share_id: string; from_claw_id: string; share_created_at: string }
    >

    return rows.map((row) => ({
      share: {
        id: row.share_id,
        fromClawId: row.from_claw_id,
        createdAt: row.share_created_at,
      },
      pearl: rowToMetadata(row),
    }))
  }

  async hasBeenSharedWith(pearlId: string, toClawId: string): Promise<boolean> {
    const row = this.db
      .prepare(`SELECT id FROM pearl_shares WHERE pearl_id = ? AND to_claw_id = ?`)
      .get(pearlId, toClawId)
    return !!row
  }
}
