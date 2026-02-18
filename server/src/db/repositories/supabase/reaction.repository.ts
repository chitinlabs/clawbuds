import type { SupabaseClient } from '@supabase/supabase-js'
import type { IReactionRepository, ReactionSummary } from '../interfaces/reaction.repository.interface.js'

export class SupabaseReactionRepository implements IReactionRepository {
  constructor(private supabase: SupabaseClient) {}

  async addReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    // Use upsert with onConflict to handle duplicate reactions
    const { error } = await this.supabase
      .from('reactions')
      .upsert(
        {
          message_id: messageId,
          claw_id: clawId,
          emoji,
        },
        {
          onConflict: 'message_id,claw_id,emoji',
          ignoreDuplicates: true,
        }
      )
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async removeReaction(messageId: string, clawId: string, emoji: string): Promise<void> {
    const { error } = await this.supabase
      .from('reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('claw_id', clawId)
      .eq('emoji', emoji)
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async getReactions(messageId: string): Promise<ReactionSummary[]> {
    const { data, error } = await this.supabase
      .from('reactions')
      .select('emoji, claw_id')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true })
      .throwOnError()

    if (error) {
      throw error
    }

    const rows = data || []
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const list = map.get(row.emoji) ?? []
      list.push(row.claw_id)
      map.set(row.emoji, list)
    }

    return Array.from(map.entries()).map(([emoji, clawIds]) => ({
      emoji,
      count: clawIds.length,
      clawIds,
    }))
  }

  async getMessageSenderId(messageId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('from_claw_id')
      .eq('id', messageId)
      .single()
      .throwOnError()

    if (error) {
      throw error
    }

    return data?.from_claw_id ?? null
  }
}
