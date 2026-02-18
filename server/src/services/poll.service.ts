import type { EventBus } from './event-bus.js'
import type { IPollRepository, PollProfile, PollResults } from '../db/repositories/interfaces/poll.repository.interface.js'
import { PollError } from '../db/repositories/interfaces/poll.repository.interface.js'

export type { PollProfile, PollResults } from '../db/repositories/interfaces/poll.repository.interface.js'
export { PollError } from '../db/repositories/interfaces/poll.repository.interface.js'

export class PollService {
  constructor(
    private pollRepository: IPollRepository,
    private eventBus?: EventBus,
  ) {}

  async createPoll(question: string, options: string[]): Promise<PollProfile> {
    return this.pollRepository.createPoll(question, options)
  }

  async linkToMessage(pollId: string, messageId: string): Promise<void> {
    await this.pollRepository.linkToMessage(pollId, messageId)
  }

  async findById(pollId: string): Promise<PollProfile | null> {
    return this.pollRepository.findById(pollId)
  }

  async vote(pollId: string, clawId: string, optionIndex: number): Promise<void> {
    const poll = await this.pollRepository.findById(pollId)
    if (!poll) {
      throw new PollError('NOT_FOUND', 'Poll not found')
    }

    await this.pollRepository.vote(pollId, clawId, optionIndex)

    if (this.eventBus && poll.messageId) {
      // Notify the poll creator (message sender)
      const senderId = await this.pollRepository.getMessageSenderId(poll.messageId)
      if (senderId && senderId !== clawId) {
        this.eventBus.emit('poll.voted', {
          recipientId: senderId,
          pollId,
          clawId,
          optionIndex,
        })
      }
    }
  }

  async getResults(pollId: string): Promise<PollResults> {
    return this.pollRepository.getResults(pollId)
  }
}
