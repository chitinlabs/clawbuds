import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Block } from '@clawbuds/shared'
import type { FriendshipService } from './friendship.service.js'
import type { CircleService } from './circle.service.js'
import type { InboxEntry } from './inbox.service.js'
import type { EventBus } from './event-bus.js'
import type { PollService } from './poll.service.js'

export type MessageVisibility = 'public' | 'direct' | 'circles'

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

export interface MessageProfile {
  id: string
  fromClawId: string
  blocks: Block[]
  visibility: MessageVisibility
  circles: string[] | null
  contentWarning: string | null
  replyToId: string | null
  threadId: string | null
  edited: boolean
  editedAt: string | null
  createdAt: string
}

function rowToProfile(row: MessageRow): MessageProfile {
  return {
    id: row.id,
    fromClawId: row.from_claw_id,
    blocks: JSON.parse(row.blocks_json) as Block[],
    visibility: row.visibility,
    circles: row.circles_json ? (JSON.parse(row.circles_json) as string[]) : null,
    contentWarning: row.content_warning,
    replyToId: row.reply_to_id,
    threadId: row.thread_id,
    edited: row.edited === 1,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  }
}

export interface SendMessageInput {
  blocks: Block[]
  visibility: MessageVisibility
  toClawIds?: string[]
  circleNames?: string[]
  contentWarning?: string
  replyTo?: string
}

export interface SendMessageResult {
  message: MessageProfile
  recipientCount: number
  recipients: string[]
}

export class MessageService {
  constructor(
    private db: Database.Database,
    private friendshipService: FriendshipService,
    private circleService: CircleService,
    private eventBus?: EventBus,
    private pollService?: PollService,
  ) {}

  async sendMessage(fromClawId: string, input: SendMessageInput): Promise<SendMessageResult> {
    // Determine recipients (async operations must be done outside transaction)
    let recipientIds: string[]

    if (input.visibility === 'public') {
      const friends = await this.friendshipService.listFriends(fromClawId)
      recipientIds = friends.map((f) => f.clawId)
    } else if (input.visibility === 'circles') {
      if (!input.circleNames || input.circleNames.length === 0) {
        throw new MessageError('MISSING_CIRCLES', 'Layers messages require circleNames')
      }
      recipientIds = this.circleService.getFriendIdsByCircles(fromClawId, input.circleNames)
    } else {
      // Direct
      if (!input.toClawIds || input.toClawIds.length === 0) {
        throw new MessageError('MISSING_RECIPIENTS', 'Direct messages require recipients')
      }
      // Deduplicate and filter self
      recipientIds = [...new Set(input.toClawIds)]
      for (const recipientId of recipientIds) {
        if (recipientId === fromClawId) {
          throw new MessageError('INVALID_RECIPIENT', 'Cannot send a message to yourself')
        }
        const areFriends = await this.friendshipService.areFriends(fromClawId, recipientId)
        if (!areFriends) {
          throw new MessageError(
            'NOT_FRIENDS',
            'One or more recipients are not your friends',
          )
        }
      }
    }

    // Resolve thread fields (async operations must be done outside transaction)
    let replyToId: string | null = null
    let threadId: string | null = null

    if (input.replyTo) {
      const parent = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(input.replyTo) as MessageRow | undefined
      if (!parent) {
        throw new MessageError('NOT_FOUND', 'Reply-to message not found')
      }
      const parentProfile = rowToProfile(parent)
      const canView = await this.canViewMessage(parentProfile, fromClawId)
      if (!canView) {
        throw new MessageError('NOT_FOUND', 'Reply-to message not found')
      }
      replyToId = parent.id
      threadId = parent.thread_id || parent.id
    }

    const result = this.db.transaction(() => {

      // Handle poll blocks: create poll and inject pollId
      let blocks = input.blocks
      if (this.pollService) {
        blocks = blocks.map((block) => {
          if (block.type === 'poll') {
            const poll = this.pollService!.createPoll(block.question, (block as { options: string[] }).options)
            return { ...block, pollId: poll.id }
          }
          return block
        })
      }

      // Insert message
      const id = generateTimeOrderedId()
      const blocksJson = JSON.stringify(blocks)
      const layersJson = input.circleNames ? JSON.stringify(input.circleNames) : null

      const messageRow = this.db
        .prepare(
          `INSERT INTO messages (id, from_claw_id, blocks_json, visibility, circles_json, content_warning, reply_to_id, thread_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .get(id, fromClawId, blocksJson, input.visibility, layersJson, input.contentWarning ?? null, replyToId, threadId) as MessageRow

      // Insert direct message recipients
      if (input.visibility === 'direct') {
        const insertRecipient = this.db.prepare(
          'INSERT INTO message_recipients (message_id, recipient_id) VALUES (?, ?)',
        )
        for (const recipientId of recipientIds) {
          insertRecipient.run(id, recipientId)
        }
      }

      // Fanout to inbox
      if (recipientIds.length > 0) {
        const insertInbox = this.db.prepare(
          'INSERT INTO inbox_entries (id, recipient_id, message_id, seq) VALUES (?, ?, ?, ?)',
        )

        for (const recipientId of recipientIds) {
          const seq = this.nextSeq(recipientId)
          insertInbox.run(randomUUID(), recipientId, id, seq)
        }
      }

      // Link poll to message
      if (this.pollService) {
        for (const block of blocks) {
          if (block.type === 'poll' && 'pollId' in block) {
            this.pollService.linkToMessage((block as { pollId: string }).pollId, id)
          }
        }
      }

      return {
        message: rowToProfile(messageRow),
        recipientCount: recipientIds.length,
        recipients: recipientIds,
      }
    })()

    // Emit events after transaction commits
    if (this.eventBus && result.recipients.length > 0) {
      for (const recipientId of result.recipients) {
        const entry = this.getInboxEntryForRecipient(recipientId, result.message.id)
        if (entry) {
          this.eventBus.emit('message.new', { recipientId, entry })
        }
      }
    }

    return result
  }

  findById(id: string): MessageProfile | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined
    return row ? rowToProfile(row) : null
  }

  async editMessage(messageId: string, clawId: string, blocks: Block[]): Promise<MessageProfile> {
    const message = this.findById(messageId)
    if (!message) {
      throw new MessageError('NOT_FOUND', 'Message not found')
    }
    if (message.fromClawId !== clawId) {
      throw new MessageError('NOT_AUTHORIZED', 'Can only edit your own messages')
    }

    const blocksJson = JSON.stringify(blocks)
    const row = this.db
      .prepare(
        `UPDATE messages
         SET blocks_json = ?, edited = 1, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?
         RETURNING *`,
      )
      .get(blocksJson, messageId) as MessageRow

    const updated = rowToProfile(row)

    // Emit to all recipients
    if (this.eventBus) {
      const recipients = await this.getMessageRecipients(messageId, message)
      for (const recipientId of recipients) {
        this.eventBus.emit('message.edited', { recipientId, message: updated })
      }
    }

    return updated
  }

  async deleteMessage(messageId: string, clawId: string): Promise<void> {
    const message = this.findById(messageId)
    if (!message) {
      throw new MessageError('NOT_FOUND', 'Message not found')
    }
    if (message.fromClawId !== clawId) {
      throw new MessageError('NOT_AUTHORIZED', 'Can only delete your own messages')
    }

    // Get recipients before deletion
    const recipients = await this.getMessageRecipients(messageId, message)

    // CASCADE will clean up message_recipients and inbox_entries
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)

    // Emit delete events
    if (this.eventBus) {
      for (const recipientId of recipients) {
        this.eventBus.emit('message.deleted', { recipientId, messageId })
      }
    }
  }

  async getThread(threadId: string, clawId: string): Promise<MessageProfile[]> {
    // First, get the root message (the threadId IS the root message id)
    const root = this.findById(threadId)
    const canView = !root ? false : await this.canViewMessage(root, clawId)
    if (!root || !canView) {
      throw new MessageError('NOT_FOUND', 'Thread not found')
    }

    const rows = this.db
      .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC')
      .all(threadId) as MessageRow[]

    // Include root + replies
    return [root, ...rows.map(rowToProfile)]
  }

  async canViewMessage(message: MessageProfile, clawId: string): Promise<boolean> {
    // Sender can always view
    if (message.fromClawId === clawId) return true

    if (message.visibility === 'public') {
      return await this.friendshipService.areFriends(message.fromClawId, clawId)
    }

    if (message.visibility === 'direct') {
      const row = this.db
        .prepare(
          'SELECT 1 FROM message_recipients WHERE message_id = ? AND recipient_id = ?',
        )
        .get(message.id, clawId)
      return !!row
    }

    if (message.visibility === 'circles') {
      // Check if viewer is in any of the layers this message was sent to
      if (!message.circles || message.circles.length === 0) return false
      const memberIds = this.circleService.getFriendIdsByCircles(message.fromClawId, message.circles)
      return memberIds.includes(clawId)
    }

    return false
  }

  private async getMessageRecipients(messageId: string, message: MessageProfile): Promise<string[]> {
    if (message.visibility === 'direct') {
      const rows = this.db
        .prepare('SELECT recipient_id FROM message_recipients WHERE message_id = ?')
        .all(messageId) as { recipient_id: string }[]
      return rows.map((r) => r.recipient_id)
    }

    if (message.visibility === 'public') {
      const friends = await this.friendshipService.listFriends(message.fromClawId)
      return friends.map((f) => f.clawId)
    }

    if (message.visibility === 'circles' && message.circles) {
      return this.circleService.getFriendIdsByCircles(message.fromClawId, message.circles)
    }

    return []
  }

  private getInboxEntryForRecipient(recipientId: string, messageId: string): InboxEntry | null {
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

  private nextSeq(clawId: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO seq_counters (claw_id, seq) VALUES (?, 1)
         ON CONFLICT(claw_id) DO UPDATE SET seq = seq + 1
         RETURNING seq`,
      )
      .get(clawId) as { seq: number }
    return row.seq
  }
}

export function generateTimeOrderedId(): string {
  const timestamp = Date.now().toString(16).padStart(12, '0')
  const random = randomUUID().replace(/-/g, '').slice(0, 20)
  return `${timestamp}${random}`
}

export class MessageError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MessageError'
  }
}
