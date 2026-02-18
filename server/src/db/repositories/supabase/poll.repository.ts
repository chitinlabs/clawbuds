import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { IPollRepository, PollProfile, PollResults } from '../interfaces/poll.repository.interface.js'
import { PollError } from '../interfaces/poll.repository.interface.js'

interface PollRow {
  id: string
  message_id: string | null
  question: string
  options_json: string | string[]
  created_at: string
}

interface PollVoteRow {
  poll_id: string
  claw_id: string
  option_index: number
  created_at: string
}

function rowToProfile(row: PollRow): PollProfile {
  const options = typeof row.options_json === 'string'
    ? JSON.parse(row.options_json) as string[]
    : row.options_json

  return {
    id: row.id,
    messageId: row.message_id || null,
    question: row.question,
    options,
    createdAt: row.created_at,
  }
}

export class SupabasePollRepository implements IPollRepository {
  constructor(private supabase: SupabaseClient) {}

  async createPoll(question: string, options: string[]): Promise<PollProfile> {
    const id = randomUUID()

    const { data, error } = await this.supabase
      .from('polls')
      .insert({
        id,
        message_id: null,
        question,
        options_json: options, // PostgreSQL JSONB accepts array directly
      })
      .select()
      .single()
      .throwOnError()

    if (error) {
      throw error
    }

    if (!data) {
      throw new Error('Failed to create poll: no data returned')
    }

    return rowToProfile(data as PollRow)
  }

  async linkToMessage(pollId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from('polls')
      .update({ message_id: messageId })
      .eq('id', pollId)
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async findById(pollId: string): Promise<PollProfile | null> {
    const { data, error } = await this.supabase
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data ? rowToProfile(data as PollRow) : null
  }

  async vote(pollId: string, clawId: string, optionIndex: number): Promise<void> {
    const poll = await this.findById(pollId)
    if (!poll) {
      throw new PollError('NOT_FOUND', 'Poll not found')
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new PollError('INVALID_OPTION', 'Invalid option index')
    }

    // Upsert: replace existing vote
    const { error } = await this.supabase
      .from('poll_votes')
      .upsert(
        {
          poll_id: pollId,
          claw_id: clawId,
          option_index: optionIndex,
        },
        {
          onConflict: 'poll_id,claw_id',
        }
      )
      .throwOnError()

    if (error) {
      throw error
    }
  }

  async getResults(pollId: string): Promise<PollResults> {
    const poll = await this.findById(pollId)
    if (!poll) {
      throw new PollError('NOT_FOUND', 'Poll not found')
    }

    const { data: voteRows, error } = await this.supabase
      .from('poll_votes')
      .select('*')
      .eq('poll_id', pollId)
      .order('created_at', { ascending: true })
      .throwOnError()

    if (error) {
      throw error
    }

    const votes: Record<number, string[]> = {}
    for (const row of (voteRows || []) as PollVoteRow[]) {
      if (!votes[row.option_index]) {
        votes[row.option_index] = []
      }
      votes[row.option_index].push(row.claw_id)
    }

    return {
      poll,
      votes,
      totalVotes: (voteRows || []).length,
    }
  }

  async getMessageSenderId(messageId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('messages')
      .select('from_claw_id')
      .eq('id', messageId)
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data?.from_claw_id ?? null
  }
}
