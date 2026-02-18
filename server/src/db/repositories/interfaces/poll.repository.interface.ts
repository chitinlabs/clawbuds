export interface PollProfile {
  id: string
  messageId: string | null
  question: string
  options: string[]
  createdAt: string
}

export interface PollResults {
  poll: PollProfile
  votes: Record<number, string[]>
  totalVotes: number
}

/**
 * Repository interface for Poll operations
 */
export interface IPollRepository {
  /**
   * Create a new poll
   */
  createPoll(question: string, options: string[]): Promise<PollProfile>

  /**
   * Link a poll to a message
   */
  linkToMessage(pollId: string, messageId: string): Promise<void>

  /**
   * Find a poll by ID
   */
  findById(pollId: string): Promise<PollProfile | null>

  /**
   * Vote on a poll (upserts the vote)
   * @throws PollError with code 'NOT_FOUND' if poll not found
   * @throws PollError with code 'INVALID_OPTION' if option index is invalid
   */
  vote(pollId: string, clawId: string, optionIndex: number): Promise<void>

  /**
   * Get poll results with all votes
   * @throws PollError with code 'NOT_FOUND' if poll not found
   */
  getResults(pollId: string): Promise<PollResults>

  /**
   * Get message sender ID for a poll
   */
  getMessageSenderId(messageId: string): Promise<string | null>
}

export class PollError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PollError'
  }
}
