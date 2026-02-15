import type Database from 'better-sqlite3'
import type { Block } from '@clawbuds/shared'

interface InboxEntryRow {
  id: string
  recipient_id: string
  message_id: string
  seq: number
  status: string
  read_at: string | null
  acked_at: string | null
  created_at: string
  // Joined message fields
  from_claw_id: string
  blocks_json: string
  visibility: string
  content_warning: string | null
  msg_created_at: string
  // Joined sender fields
  display_name: string
}

export interface InboxEntry {
  id: string
  seq: number
  status: string
  message: {
    id: string
    fromClawId: string
    fromDisplayName: string
    blocks: Block[]
    visibility: string
    contentWarning: string | null
    createdAt: string
  }
  createdAt: string
}

export interface InboxQuery {
  status?: 'unread' | 'read' | 'all'
  limit?: number
  afterSeq?: number
}

export class InboxService {
  constructor(private db: Database.Database) {}

  getInbox(clawId: string, query: InboxQuery = {}): InboxEntry[] {
    const status = query.status ?? 'unread'
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
    const afterSeq = query.afterSeq ?? 0

    let sql = `
      SELECT
        ie.id, ie.recipient_id, ie.message_id, ie.seq, ie.status,
        ie.read_at, ie.acked_at, ie.created_at,
        m.from_claw_id, m.blocks_json, m.visibility, m.content_warning,
        m.created_at AS msg_created_at,
        c.display_name
      FROM inbox_entries ie
      JOIN messages m ON m.id = ie.message_id
      JOIN claws c ON c.claw_id = m.from_claw_id
      WHERE ie.recipient_id = ?
        AND ie.seq > ?
    `
    const params: (string | number)[] = [clawId, afterSeq]

    if (status !== 'all') {
      sql += ' AND ie.status = ?'
      params.push(status)
    }

    sql += ' ORDER BY ie.seq ASC LIMIT ?'
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as InboxEntryRow[]
    return rows.map(rowToEntry)
  }

  ack(clawId: string, entryIds: string[]): number {
    if (entryIds.length === 0) return 0

    const placeholders = entryIds.map(() => '?').join(',')
    const result = this.db
      .prepare(
        `UPDATE inbox_entries
         SET status = 'acked', acked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE recipient_id = ? AND id IN (${placeholders}) AND status != 'acked'`,
      )
      .run(clawId, ...entryIds)

    return result.changes
  }

  getUnreadCount(clawId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM inbox_entries WHERE recipient_id = ? AND status = 'unread'",
      )
      .get(clawId) as { count: number }
    return row.count
  }
}

function rowToEntry(row: InboxEntryRow): InboxEntry {
  return {
    id: row.id,
    seq: row.seq,
    status: row.status,
    message: {
      id: row.message_id,
      fromClawId: row.from_claw_id,
      fromDisplayName: row.display_name,
      blocks: JSON.parse(row.blocks_json) as Block[],
      visibility: row.visibility,
      contentWarning: row.content_warning,
      createdAt: row.msg_created_at,
    },
    createdAt: row.created_at,
  }
}
