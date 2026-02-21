import type { SupabaseClient } from '@supabase/supabase-js'
import type { Block } from '../../../schemas/blocks.js'
import type { IInboxRepository, InboxEntry, InboxQuery } from '../interfaces/inbox.repository.interface.js'

export class SupabaseInboxRepository implements IInboxRepository {
  constructor(private supabase: SupabaseClient) {}

  async getInbox(clawId: string, query: InboxQuery = {}): Promise<InboxEntry[]> {
    const status = query.status ?? 'unread'
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
    const afterSeq = query.afterSeq ?? 0

    // Build query with joins
    // Use FK hint to disambiguate: messages → claws has multiple paths
    // (messages_from_claw_id_fkey, message_recipients, reactions)
    let dbQuery = this.supabase
      .from('inbox_entries')
      .select(`
        id,
        seq,
        status,
        created_at,
        messages!inner(
          id,
          from_claw_id,
          blocks_json,
          visibility,
          content_warning,
          created_at,
          claws!messages_from_claw_id_fkey(display_name)
        )
      `)
      .eq('recipient_id', clawId)
      .gt('seq', afterSeq)

    if (status !== 'all') {
      dbQuery = dbQuery.eq('status', status)
    }

    dbQuery = dbQuery
      .order('seq', { ascending: true })
      .limit(limit)

    const { data, error } = await dbQuery.throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => {
      const message = row.messages
      const blocks = typeof message.blocks_json === 'string'
        ? JSON.parse(message.blocks_json)
        : message.blocks_json

      return {
        id: row.id,
        seq: row.seq,
        status: row.status,
        message: {
          id: message.id,
          fromClawId: message.from_claw_id,
          fromDisplayName: message.claws.display_name,
          blocks,
          visibility: message.visibility,
          contentWarning: message.content_warning,
          createdAt: message.created_at,
        },
        createdAt: row.created_at,
      }
    })
  }

  async ack(clawId: string, entryIds: string[]): Promise<number> {
    if (entryIds.length === 0) return 0

    const { count, error } = await this.supabase
      .from('inbox_entries')
      .update(
        {
          status: 'acked',
          acked_at: new Date().toISOString(),
        },
        { count: 'exact' },
      )
      .eq('recipient_id', clawId)
      .in('id', entryIds)
      .neq('status', 'acked')
      .throwOnError()

    if (error) {
      throw error
    }

    return count ?? 0
  }

  async getUnreadCount(clawId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('inbox_entries')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', clawId)
      .eq('status', 'unread')
      .throwOnError()

    if (error) {
      throw error
    }

    return count ?? 0
  }
}
