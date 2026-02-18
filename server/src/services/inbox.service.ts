import type { IInboxRepository, InboxEntry, InboxQuery } from '../db/repositories/interfaces/inbox.repository.interface.js'

export type { InboxEntry, InboxQuery } from '../db/repositories/interfaces/inbox.repository.interface.js'

export class InboxService {
  constructor(private inboxRepository: IInboxRepository) {}

  async getInbox(clawId: string, query: InboxQuery = {}): Promise<InboxEntry[]> {
    return this.inboxRepository.getInbox(clawId, query)
  }

  async ack(clawId: string, entryIds: string[]): Promise<number> {
    return this.inboxRepository.ack(clawId, entryIds)
  }

  async getUnreadCount(clawId: string): Promise<number> {
    return this.inboxRepository.getUnreadCount(clawId)
  }
}
