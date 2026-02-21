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

  async findByReplyChain(
    replyChainId: string,
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
      .all(replyChainId, limit, offset) as MessageRow[]

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

  // ========== 底层数据访问方法 ==========

  async isMessageRecipient(messageId: string, clawId: string): Promise<boolean> {
    const result = this.db
      .prepare('SELECT 1 FROM message_recipients WHERE message_id = ? AND recipient_id = ? LIMIT 1')
      .get(messageId, clawId)
    return result !== undefined
  }

  async findMessageRecipientIds(messageId: string): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT recipient_id FROM message_recipients WHERE message_id = ?')
      .all(messageId) as { recipient_id: string }[]
    return rows.map((r) => r.recipient_id)
  }

  async findInboxEntry(
    recipientId: string,
    messageId: string,
  ): Promise<{
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
  } | null> {
    const row = this.db
      .prepare(
        `SELECT
          ie.id, ie.seq, ie.status, ie.created_at,
          m.id AS message_id, m.from_claw_id, m.blocks_json,
          m.visibility, m.content_warning, m.created_at AS msg_created_at,
          c.display_name
        FROM inbox_entries ie
        JOIN messages m ON m.id = ie.message_id
        JOIN claws c ON c.claw_id = m.from_claw_id
        WHERE ie.recipient_id = ? AND ie.message_id = ?`,
      )
      .get(recipientId, messageId) as
      | {
          id: string
          seq: number
          status: string
          created_at: string
          message_id: string
          from_claw_id: string
          blocks_json: string
          visibility: string
          content_warning: string | null
          msg_created_at: string
          display_name: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      seq: row.seq,
      status: row.status,
      message: {
        id: row.message_id,
        fromClawId: row.from_claw_id,
        fromDisplayName: row.display_name,
        blocks: JSON.parse(row.blocks_json),
        visibility: row.visibility,
        contentWarning: row.content_warning,
        createdAt: row.msg_created_at,
      },
      createdAt: row.created_at,
    }
  }

  async incrementSeqCounter(clawId: string): Promise<number> {
    const row = this.db
      .prepare(
        `INSERT INTO seq_counters (claw_id, seq) VALUES (?, 1)
         ON CONFLICT(claw_id) DO UPDATE SET seq = seq + 1
         RETURNING seq`,
      )
      .get(clawId) as { seq: number }
    return row.seq
  }

  async insertMessageWithRecipients(data: {
    messageId: string
    fromClawId: string
    blocks: Block[]
    visibility: MessageVisibility
    circles?: string[]
    contentWarning?: string
    replyToId?: string
    threadId?: string
    recipientIds: string[]
  }): Promise<MessageProfile> {
    return new Promise((resolve, reject) => {
      try {
        const result = this.db.transaction(() => {
          const blocksJson = JSON.stringify(data.blocks)
          const circlesJson = data.circles ? JSON.stringify(data.circles) : null

          // 插入消息
          this.db
            .prepare(
              `INSERT INTO messages (id, from_claw_id, blocks_json, visibility, circles_json, content_warning, reply_to_id, thread_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              data.messageId,
              data.fromClawId,
              blocksJson,
              data.visibility,
              circlesJson,
              data.contentWarning ?? null,
              data.replyToId ?? null,
              data.threadId ?? null,
            )

          // 插入接收者(仅 direct 消息)
          if (data.visibility === 'direct' && data.recipientIds.length > 0) {
            const insertRecipient = this.db.prepare(
              'INSERT INTO message_recipients (message_id, recipient_id) VALUES (?, ?)',
            )
            for (const recipientId of data.recipientIds) {
              insertRecipient.run(data.messageId, recipientId)
            }
          }

          // 插入收件箱条目
          if (data.recipientIds.length > 0) {
            const insertInbox = this.db.prepare(
              'INSERT INTO inbox_entries (id, recipient_id, message_id, seq) VALUES (?, ?, ?, ?)',
            )

            for (const recipientId of data.recipientIds) {
              const seqRow = this.db
                .prepare(
                  `INSERT INTO seq_counters (claw_id, seq) VALUES (?, 1)
                   ON CONFLICT(claw_id) DO UPDATE SET seq = seq + 1
                   RETURNING seq`,
                )
                .get(recipientId) as { seq: number }

              insertInbox.run(randomUUID(), recipientId, data.messageId, seqRow.seq)
            }
          }

          // 查询插入的消息
          const messageRow = this.db
            .prepare('SELECT * FROM messages WHERE id = ?')
            .get(data.messageId) as MessageRow

          return this.rowToMessage(messageRow)
        })()

        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  }
}
