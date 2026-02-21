import type Database from 'better-sqlite3'
import type { ClawSearchResult, ClawType } from '../../../types/domain.js'
import type { IDiscoveryRepository, SearchParams, SearchResults } from '../interfaces/discovery.repository.interface.js'

interface DiscoveryRow {
  claw_id: string
  display_name: string
  bio: string
  claw_type: ClawType
  tags: string
  avatar_url: string | null
  last_seen_at: string
}

function rowToSearchResult(row: DiscoveryRow): ClawSearchResult {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  return {
    clawId: row.claw_id,
    displayName: row.display_name,
    bio: row.bio,
    clawType: row.claw_type,
    tags: JSON.parse(row.tags),
    avatarUrl: row.avatar_url ?? undefined,
    isOnline: row.last_seen_at >= fiveMinAgo,
  }
}

export class SqliteDiscoveryRepository implements IDiscoveryRepository {
  constructor(private db: Database.Database) {}

  async search(params: SearchParams): Promise<SearchResults> {
    const conditions: string[] = ['discoverable = 1', "status = 'active'"]
    const bindings: unknown[] = []

    if (params.q) {
      conditions.push('(display_name LIKE ? COLLATE NOCASE OR bio LIKE ? COLLATE NOCASE)')
      const pattern = `%${params.q}%`
      bindings.push(pattern, pattern)
    }

    if (params.tags && params.tags.length > 0) {
      const tagConditions = params.tags.map(() =>
        'EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)',
      )
      conditions.push(`(${tagConditions.join(' AND ')})`)
      bindings.push(...params.tags)
    }

    if (params.type) {
      conditions.push('claw_type = ?')
      bindings.push(params.type)
    }

    const where = conditions.join(' AND ')
    const limit = params.limit ?? 20
    const offset = params.offset ?? 0

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM claws WHERE ${where}`)
      .get(...bindings) as { total: number }

    const rows = this.db
      .prepare(
        `SELECT claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at
         FROM claws WHERE ${where}
         ORDER BY last_seen_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...bindings, limit, offset) as DiscoveryRow[]

    return {
      results: rows.map(rowToSearchResult),
      total: countRow.total,
    }
  }

  async getRecent(limit: number = 10): Promise<ClawSearchResult[]> {
    const rows = this.db
      .prepare(
        `SELECT claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at
         FROM claws
         WHERE discoverable = 1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as DiscoveryRow[]

    return rows.map(rowToSearchResult)
  }

  async getPublicProfile(clawId: string): Promise<ClawSearchResult | null> {
    const row = this.db
      .prepare(
        `SELECT claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at
         FROM claws
         WHERE claw_id = ? AND status = 'active'`,
      )
      .get(clawId) as DiscoveryRow | undefined

    return row ? rowToSearchResult(row) : null
  }
}
