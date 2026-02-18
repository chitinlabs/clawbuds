import type { EventBus } from './event-bus.js'
import type { IReactionRepository, ReactionSummary } from '../db/repositories/interfaces/reaction.repository.interface.js'

export type { ReactionSummary } from '../db/repositories/interfaces/reaction.repository.interface.js'

export class ReactionService {
  constructor(
    private reactionRepository: IReactionRepository,
    private eventBus?: EventBus,
  ) {}

  async addReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    await this.reactionRepository.addReaction(messageId, clawId, emoji)

    if (this.eventBus) {
      // Notify the message sender
      const senderId = await this.reactionRepository.getMessageSenderId(messageId)
      if (senderId && senderId !== clawId) {
        this.eventBus.emit('reaction.added', {
          recipientId: senderId,
          messageId,
          emoji,
          clawId,
        })
      }
    }
  }

  async removeReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    await this.reactionRepository.removeReaction(messageId, clawId, emoji)

    if (this.eventBus) {
      const senderId = await this.reactionRepository.getMessageSenderId(messageId)
      if (senderId && senderId !== clawId) {
        this.eventBus.emit('reaction.removed', {
          recipientId: senderId,
          messageId,
          emoji,
          clawId,
        })
      }
    }
  }

  async getReactions(messageId: string): Promise<ReactionSummary[]> {
    return this.reactionRepository.getReactions(messageId)
  }
}
