import { randomUUID } from 'node:crypto'
import type { Block } from '@clawbuds/shared'
import type { FriendshipService } from './friendship.service.js'
import type { CircleService } from './circle.service.js'
import type { EventBus } from './event-bus.js'
import type { PollService } from './poll.service.js'
import type { IMessageRepository } from '../db/repositories/interfaces/message.repository.interface.js'

export type MessageVisibility = 'public' | 'direct' | 'circles'

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
    private messageRepository: IMessageRepository,
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
      const parent = await this.messageRepository.findById(input.replyTo)
      if (!parent) {
        throw new MessageError('NOT_FOUND', 'Reply-to message not found')
      }
      const canView = await this.canViewMessage(parent, fromClawId)
      if (!canView) {
        throw new MessageError('NOT_FOUND', 'Reply-to message not found')
      }
      replyToId = parent.id
      threadId = parent.threadId || parent.id
    }

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

    // Insert message with recipients (Repository handles transaction)
    const messageId = generateTimeOrderedId()
    const message = await this.messageRepository.insertMessageWithRecipients({
      messageId,
      fromClawId,
      blocks,
      visibility: input.visibility,
      circles: input.circleNames,
      contentWarning: input.contentWarning,
      replyToId: replyToId ?? undefined,
      threadId: threadId ?? undefined,
      recipientIds,
    })

    // Link poll to message (after transaction)
    if (this.pollService) {
      for (const block of blocks) {
        if (block.type === 'poll' && 'pollId' in block) {
          this.pollService.linkToMessage((block as { pollId: string }).pollId, messageId)
        }
      }
    }

    const result = {
      message,
      recipientCount: recipientIds.length,
      recipients: recipientIds,
    }

    // Emit events after transaction commits
    if (this.eventBus && result.recipients.length > 0) {
      for (const recipientId of result.recipients) {
        const entry = await this.getInboxEntryForRecipient(recipientId, result.message.id)
        if (entry) {
          this.eventBus.emit('message.new', { recipientId, entry })
        }
      }
    }

    return result
  }

  async findById(id: string): Promise<MessageProfile | null> {
    return this.messageRepository.findById(id)
  }

  async editMessage(messageId: string, clawId: string, blocks: Block[]): Promise<MessageProfile> {
    const message = await this.findById(messageId)
    if (!message) {
      throw new MessageError('NOT_FOUND', 'Message not found')
    }
    if (message.fromClawId !== clawId) {
      throw new MessageError('NOT_AUTHORIZED', 'Can only edit your own messages')
    }

    const updated = await this.messageRepository.editMessage(messageId, clawId, blocks)
    if (!updated) {
      throw new MessageError('NOT_FOUND', 'Message not found')
    }

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
    const message = await this.findById(messageId)
    if (!message) {
      throw new MessageError('NOT_FOUND', 'Message not found')
    }
    if (message.fromClawId !== clawId) {
      throw new MessageError('NOT_AUTHORIZED', 'Can only delete your own messages')
    }

    // Get recipients before deletion
    const recipients = await this.getMessageRecipients(messageId, message)

    // CASCADE will clean up message_recipients and inbox_entries
    await this.messageRepository.deleteMessage(messageId, clawId)

    // Emit delete events
    if (this.eventBus) {
      for (const recipientId of recipients) {
        this.eventBus.emit('message.deleted', { recipientId, messageId })
      }
    }
  }

  async getThread(threadId: string, clawId: string): Promise<MessageProfile[]> {
    // First, get the root message (the threadId IS the root message id)
    const root = await this.findById(threadId)
    const canView = !root ? false : await this.canViewMessage(root, clawId)
    if (!root || !canView) {
      throw new MessageError('NOT_FOUND', 'Thread not found')
    }

    const replies = await this.messageRepository.findByThread(threadId)

    // Include root + replies
    return [root, ...replies]
  }

  async canViewMessage(message: MessageProfile, clawId: string): Promise<boolean> {
    // Sender can always view
    if (message.fromClawId === clawId) return true

    if (message.visibility === 'public') {
      return await this.friendshipService.areFriends(message.fromClawId, clawId)
    }

    if (message.visibility === 'direct') {
      return await this.messageRepository.isMessageRecipient(message.id, clawId)
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
      return await this.messageRepository.findMessageRecipientIds(messageId)
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

  private async getInboxEntryForRecipient(recipientId: string, messageId: string) {
    return await this.messageRepository.findInboxEntry(recipientId, messageId)
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
