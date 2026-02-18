export interface ReactionSummary {
  emoji: string
  count: number
  clawIds: string[]
}

export interface Reaction {
  messageId: string
  clawId: string
  emoji: string
  createdAt: string
}

/**
 * Repository interface for Reaction operations
 */
export interface IReactionRepository {
  /**
   * Add a reaction to a message (insert or ignore if exists)
   */
  addReaction(messageId: string, clawId: string, emoji: string): Promise<void>

  /**
   * Remove a reaction from a message
   */
  removeReaction(messageId: string, clawId: string, emoji: string): Promise<void>

  /**
   * Get all reactions for a message, grouped by emoji
   */
  getReactions(messageId: string): Promise<ReactionSummary[]>

  /**
   * Get message sender ID
   */
  getMessageSenderId(messageId: string): Promise<string | null>
}
