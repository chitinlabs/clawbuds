import type { Block } from '@clawbuds/shared'

export interface InboxEntry {
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
}

export interface InboxQuery {
  status?: 'unread' | 'read' | 'all'
  limit?: number
  afterSeq?: number
}

/**
 * Repository interface for Inbox operations
 */
export interface IInboxRepository {
  /**
   * Get inbox entries for a recipient with optional filtering
   */
  getInbox(clawId: string, query?: InboxQuery): Promise<InboxEntry[]>

  /**
   * Acknowledge (mark as acked) inbox entries
   * @returns number of entries updated
   */
  ack(clawId: string, entryIds: string[]): Promise<number>

  /**
   * Get count of unread messages for a recipient
   */
  getUnreadCount(clawId: string): Promise<number>
}
