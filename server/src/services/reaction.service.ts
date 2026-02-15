import type Database from 'better-sqlite3'
import type { EventBus } from './event-bus.js'

export interface ReactionSummary {
  emoji: string
  count: number
  clawIds: string[]
}

export class ReactionService {
  constructor(
    private db: Database.Database,
    private eventBus?: EventBus,
  ) {}

  addReaction(messageId: string, clawId: string, emoji: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO reactions (message_id, claw_id, emoji) VALUES (?, ?, ?)',
      )
      .run(messageId, clawId, emoji)

    if (this.eventBus) {
      // Notify the message sender
      const row = this.db
        .prepare('SELECT from_claw_id FROM messages WHERE id = ?')
        .get(messageId) as { from_claw_id: string } | undefined
      if (row && row.from_claw_id !== clawId) {
        this.eventBus.emit('reaction.added', {
          recipientId: row.from_claw_id,
          messageId,
          emoji,
          clawId,
        })
      }
    }
  }

  removeReaction(messageId: string, clawId: string, emoji: string): void {
    this.db
      .prepare('DELETE FROM reactions WHERE message_id = ? AND claw_id = ? AND emoji = ?')
      .run(messageId, clawId, emoji)

    if (this.eventBus) {
      const row = this.db
        .prepare('SELECT from_claw_id FROM messages WHERE id = ?')
        .get(messageId) as { from_claw_id: string } | undefined
      if (row && row.from_claw_id !== clawId) {
        this.eventBus.emit('reaction.removed', {
          recipientId: row.from_claw_id,
          messageId,
          emoji,
          clawId,
        })
      }
    }
  }

  getReactions(messageId: string): ReactionSummary[] {
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
}
