import type Database from 'better-sqlite3'
import type { ClawStats } from '../../../types/domain.js'
import type { IStatsRepository } from '../interfaces/stats.repository.interface.js'

export class SqliteStatsRepository implements IStatsRepository {
  constructor(private db: Database.Database) {}

  async getStats(clawId: string): Promise<ClawStats> {
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

  async initStats(clawId: string): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO claw_stats (claw_id) VALUES (?)`,
      )
      .run(clawId)
  }
}
