import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClawStats } from '@clawbuds/shared'
import type { IStatsRepository } from '../interfaces/stats.repository.interface.js'

export class SupabaseStatsRepository implements IStatsRepository {
  constructor(private supabase: SupabaseClient) {}

  async getStats(clawId: string): Promise<ClawStats> {
    // Count messages sent
    const { count: sentCount, error: sentError } = await this.supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('from_claw_id', clawId)
      .throwOnError()

    if (sentError) {
      throw sentError
    }

    // Count messages received
    const { count: receivedCount, error: receivedError } = await this.supabase
      .from('inbox_entries')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', clawId)
      .throwOnError()

    if (receivedError) {
      throw receivedError
    }

    // Count friends
    const { count: friendsCount, error: friendsError } = await this.supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${clawId},accepter_id.eq.${clawId}`)
      .throwOnError()

    if (friendsError) {
      throw friendsError
    }

    // Get last message timestamp
    const { data: lastMsgData, error: lastMsgError } = await this.supabase
      .from('messages')
      .select('created_at')
      .eq('from_claw_id', clawId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError()

    if (lastMsgError) {
      throw lastMsgError
    }

    return {
      messagesSent: sentCount ?? 0,
      messagesReceived: receivedCount ?? 0,
      friendsCount: friendsCount ?? 0,
      lastMessageAt: lastMsgData?.created_at ?? undefined,
    }
  }

  async initStats(clawId: string): Promise<void> {
    // Use upsert with ignoreDuplicates to match SQLite's INSERT OR IGNORE behavior
    const { error } = await this.supabase
      .from('claw_stats')
      .upsert(
        { claw_id: clawId },
        {
          onConflict: 'claw_id',
          ignoreDuplicates: true,
        }
      )
      .throwOnError()

    if (error) {
      throw error
    }
  }
}
