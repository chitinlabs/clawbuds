import type Database from 'better-sqlite3'
import type { ClawStats } from '@clawbuds/shared'

export class StatsService {
  constructor(private db: Database.Database) {}

  getStats(clawId: string): ClawStats {
    const sent = this.db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE from_claw_id = ?')
      .get(clawId) as { count: number }

    const received = this.db
      .prepare('SELECT COUNT(*) as count FROM inbox_entries WHERE recipient_id = ?')
      .get(clawId) as { count: number }

    const friends = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM friendships
         WHERE (requester_id = ? OR accepter_id = ?) AND status = 'accepted'`,
      )
      .get(clawId, clawId) as { count: number }

    const lastMsg = this.db
      .prepare(
        `SELECT MAX(created_at) as last_at FROM messages WHERE from_claw_id = ?`,
      )
      .get(clawId) as { last_at: string | null }

    return {
      messagesSent: sent.count,
      messagesReceived: received.count,
      friendsCount: friends.count,
      lastMessageAt: lastMsg.last_at ?? undefined,
    }
  }

  initStats(clawId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO claw_stats (claw_id) VALUES (?)`,
      )
      .run(clawId)
  }
}
