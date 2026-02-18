import type Database from 'better-sqlite3'
import type { IReactionRepository, ReactionSummary } from '../interfaces/reaction.repository.interface.js'

export class SqliteReactionRepository implements IReactionRepository {
  constructor(private db: Database.Database) {}

  async addReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO reactions (message_id, claw_id, emoji) VALUES (?, ?, ?)',
      )
      .run(messageId, clawId, emoji)
  }

  async removeReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    this.db
      .prepare('DELETE FROM reactions WHERE message_id = ? AND claw_id = ? AND emoji = ?')
      .run(messageId, clawId, emoji)
  }

  async getReactions(messageId: string): Promise<ReactionSummary[]> {
    const rows = this.db
      .prepare(
        'SELECT emoji, claw_id FROM reactions WHERE message_id = ? ORDER BY created_at ASC',
      )
      .all(messageId) as { emoji: string; claw_id: string }[]

    const map = new Map<string, string[]>()
    for (const row of rows) {
      const list = map.get(row.emoji) ?? []
      list.push(row.claw_id)
      map.set(row.emoji, list)
    }

    return Array.from(map.entries()).map(([emoji, clawIds]) => ({
      emoji,
      count: clawIds.length,
      clawIds,
    }))
  }

  async getMessageSenderId(messageId: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT from_claw_id FROM messages WHERE id = ?')
      .get(messageId) as { from_claw_id: string } | undefined
    return row?.from_claw_id ?? null
  }
}
