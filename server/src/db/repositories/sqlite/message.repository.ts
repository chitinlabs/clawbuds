/**
 * SQLite Message Repository Implementation
 * 基于 better-sqlite3 的消息数据访问实现
 */

import type Database from 'better-sqlite3'
import type {
  IMessageRepository,
  SendMessageDTO,
  MessageProfile,
  SendMessageResult,
  MessageVisibility,
} from '../interfaces/message.repository.interface.js'
import type { Block } from '@clawbuds/shared'
import { randomUUID } from 'node:crypto'

interface MessageRow {
  id: string
  from_claw_id: string
  blocks_json: string
  visibility: MessageVisibility
  circles_json: string | null
  content_warning: string | null
  reply_to_id: string | null
  thread_id: string | null
  edited: number
  edited_at: string | null
  created_at: string
}

export class SQLiteMessageRepository implements IMessageRepository {
  constructor(private db: Database.Database) {}

  // ========== 辅助方法 ==========

  private rowToMessage(row: MessageRow): MessageProfile {
    return {
      id: row.id,
      fromClawId: row.from_claw_id,
      blocks: JSON.parse(row.blocks_json),
      visibility: row.visibility,
      circles: row.circles_json ? JSON.parse(row.circles_json) : null,
      contentWarning: row.content_warning,
      replyToId: row.reply_to_id,
      threadId: row.thread_id,
      edited: Boolean(row.edited),
      editedAt: row.edited_at,
      createdAt: row.created_at,
    }
  }

  // ========== 创建 ==========

  async sendMessage(input: SendMessageDTO): Promise<SendMessageResult> {
    const messageId = randomUUID()
    const blocksJson = JSON.stringify(input.blocks)
    const circlesJson = input.circleNames ? JSON.stringify(input.circleNames) : null

    // 插入消息
    this.db
      .prepare(
        `INSERT INTO messages (id, from_claw_id, blocks_json, visibility, circles_json, content_warning, reply_to_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        messageId,
        input.fromClawId,
        blocksJson,
        input.visibility,
        circlesJson,
        input.contentWarning ?? null,
        input.replyToId ?? null,
      )

    // 如果是 direct 消息，插入 message_recipients
    let recipients: string[] = []
    if (input.visibility === 'direct' && input.toClawIds) {
      recipients = input.toClawIds
      const insertRecipient = this.db.prepare(
        'INSERT INTO message_recipients (message_id, recipient_id) VALUES (?, ?)',
      )

      for (const recipientId of recipients) {
        insertRecipient.run(messageId, recipientId)
      }
    }

    const row = this.db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(messageId) as MessageRow

    return {
      message: this.rowToMessage(row),
      recipientCount: recipients.length,
      recipients,
    }
  }

  // ========== 查询 ==========

  async findById(messageId: string): Promise<MessageProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(messageId) as MessageRow | undefined

    return row ? this.rowToMessage(row) : null
  }

  async findByThread(
    threadId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE thread_id = ?
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`,
      )
      .all(threadId, limit, offset) as MessageRow[]

    return rows.map((row) => this.rowToMessage(row))
  }

  async findPublicMessages(
    clawId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE from_claw_id = ? AND visibility = 'public'
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(clawId, limit, offset) as MessageRow[]

    return rows.map((row) => this.rowToMessage(row))
  }

  async findReplies(
    messageId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE reply_to_id = ?
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`,
      )
      .all(messageId, limit, offset) as MessageRow[]

    return rows.map((row) => this.rowToMessage(row))
  }

  // ========== 更新 ==========

  async editMessage(
    messageId: string,
    fromClawId: string,
    blocks: Block[],
  ): Promise<MessageProfile | null> {
    const blocksJson = JSON.stringify(blocks)

    const result = this.db
      .prepare(
        `UPDATE messages
         SET blocks_json = ?, edited = 1, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND from_claw_id = ?`,
      )
      .run(blocksJson, messageId, fromClawId)

    if (result.changes === 0) {
      return null
    }

    return this.findById(messageId)
  }

  async deleteMessage(messageId: string, fromClawId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM messages WHERE id = ? AND from_claw_id = ?')
      .run(messageId, fromClawId)
  }

  // ========== 反应 ==========
  // 注意：反应功能需要额外的 reactions 表，这里暂时用简化实现

  async addReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    // 需要创建 reactions 表，暂时留空
    // TODO: 实现 reactions 表
    throw new Error('Reactions feature not implemented yet')
  }

  async removeReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    // 需要创建 reactions 表，暂时留空
    throw new Error('Reactions feature not implemented yet')
  }

  async getReactions(
    messageId: string,
  ): Promise<Array<{ clawId: string; emoji: string; createdAt: string }>> {
    // 需要创建 reactions 表，暂时留空
    return []
  }

  // ========== 统计 ==========

  async count(filters?: {
    fromClawId?: string
    visibility?: MessageVisibility
  }): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM messages WHERE 1=1'
    const params: any[] = []

    if (filters?.fromClawId) {
      query += ' AND from_claw_id = ?'
      params.push(filters.fromClawId)
    }
    if (filters?.visibility) {
      query += ' AND visibility = ?'
      params.push(filters.visibility)
    }

    const result = this.db.prepare(query).get(...params) as { count: number }
    return result.count
  }

  async exists(messageId: string): Promise<boolean> {
    const result = this.db
      .prepare('SELECT 1 FROM messages WHERE id = ? LIMIT 1')
      .get(messageId)
    return result !== undefined
  }
}
