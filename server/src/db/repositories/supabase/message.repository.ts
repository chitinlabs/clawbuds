/**
 * Supabase Message Repository Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IMessageRepository,
  SendMessageDTO,
  MessageProfile,
  SendMessageResult,
  MessageVisibility,
} from '../interfaces/message.repository.interface.js'
import type { Block } from '@clawbuds/shared'

interface MessageRow {
  id: string
  from_claw_id: string
  blocks_json: any
  visibility: MessageVisibility
  circles_json: string[] | null
  content_warning: string | null
  reply_to_id: string | null
  thread_id: string | null
  edited: boolean
  edited_at: string | null
  created_at: string
}

export class SupabaseMessageRepository implements IMessageRepository {
  constructor(private supabase: SupabaseClient) {}

  private rowToMessage(row: MessageRow): MessageProfile {
    return {
      id: row.id,
      fromClawId: row.from_claw_id,
      blocks: row.blocks_json,
      visibility: row.visibility,
      circles: row.circles_json,
      contentWarning: row.content_warning,
      replyToId: row.reply_to_id,
      threadId: row.thread_id,
      edited: row.edited,
      editedAt: row.edited_at,
      createdAt: row.created_at,
    }
  }

  async sendMessage(input: SendMessageDTO): Promise<SendMessageResult> {
    const { data: message, error: messageError } = await this.supabase
      .from('messages')
      .insert({
        from_claw_id: input.fromClawId,
        blocks_json: input.blocks,
        visibility: input.visibility,
        circles_json: input.circleNames ?? null,
        content_warning: input.contentWarning ?? null,
        reply_to_id: input.replyToId ?? null,
      })
      .select()
      .single()

    if (messageError) {
      throw new Error(`Failed to send message: ${messageError.message}`)
    }

    let recipients: string[] = []
    if (input.visibility === 'direct' && input.toClawIds) {
      recipients = input.toClawIds
      const recipientRows = recipients.map((recipientId) => ({
        message_id: message.id,
        recipient_id: recipientId,
      }))

      const { error: recipientsError } = await this.supabase
        .from('message_recipients')
        .insert(recipientRows)

      if (recipientsError) {
        throw new Error(`Failed to insert message recipients: ${recipientsError.message}`)
      }
    }

    return {
      message: this.rowToMessage(message),
      recipientCount: recipients.length,
      recipients,
    }
  }

  async findById(messageId: string): Promise<MessageProfile | null> {
    const { data: row, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find message: ${error.message}`)
    }

    return row ? this.rowToMessage(row) : null
  }

  async findByThread(
    threadId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const { data: rows, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find messages by thread: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToMessage(row))
  }

  async findPublicMessages(
    clawId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const { data: rows, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('from_claw_id', clawId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find public messages: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToMessage(row))
  }

  async findReplies(
    messageId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MessageProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const { data: rows, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('reply_to_id', messageId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find replies: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToMessage(row))
  }

  async editMessage(
    messageId: string,
    fromClawId: string,
    blocks: Block[],
  ): Promise<MessageProfile | null> {
    const { data: row, error } = await this.supabase
      .from('messages')
      .update({
        blocks_json: blocks,
        edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('from_claw_id', fromClawId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to edit message: ${error.message}`)
    }

    return row ? this.rowToMessage(row) : null
  }

  async deleteMessage(messageId: string, fromClawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('from_claw_id', fromClawId)

    if (error) {
      throw new Error(`Failed to delete message: ${error.message}`)
    }
  }

  async addReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    throw new Error('Reactions feature not implemented yet')
  }

  async removeReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    throw new Error('Reactions feature not implemented yet')
  }

  async getReactions(
    messageId: string,
  ): Promise<Array<{ clawId: string; emoji: string; createdAt: string }>> {
    return []
  }

  async count(filters?: {
    fromClawId?: string
    visibility?: MessageVisibility
  }): Promise<number> {
    let query = this.supabase.from('messages').select('*', { count: 'exact', head: true })

    if (filters?.fromClawId) {
      query = query.eq('from_claw_id', filters.fromClawId)
    }
    if (filters?.visibility) {
      query = query.eq('visibility', filters.visibility)
    }

    const { count, error } = await query

    if (error) {
      throw new Error(`Failed to count messages: ${error.message}`)
    }

    return count ?? 0
  }

  async exists(messageId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('id', messageId)

    if (error) {
      throw new Error(`Failed to check message exists: ${error.message}`)
    }

    return (count ?? 0) > 0
  }
}
