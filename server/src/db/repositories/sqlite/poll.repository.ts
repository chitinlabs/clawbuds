import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { IPollRepository, PollProfile, PollResults } from '../interfaces/poll.repository.interface.js'
import { PollError } from '../interfaces/poll.repository.interface.js'

interface PollRow {
  id: string
  message_id: string | null
  question: string
  options_json: string
  created_at: string
}

interface PollVoteRow {
  poll_id: string
  claw_id: string
  option_index: number
  created_at: string
}

function rowToProfile(row: PollRow): PollProfile {
  return {
    id: row.id,
    messageId: row.message_id || null,
    question: row.question,
    options: JSON.parse(row.options_json) as string[],
    createdAt: row.created_at,
  }
}

export class SqlitePollRepository implements IPollRepository {
  constructor(private db: Database.Database) {}

  async createPoll(question: string, options: string[]): Promise<PollProfile> {
    const id = randomUUID()
    const optionsJson = JSON.stringify(options)

    const row = this.db
      .prepare(
        `INSERT INTO polls (id, message_id, question, options_json)
         VALUES (?, NULL, ?, ?) RETURNING *`,
      )
      .get(id, question, optionsJson) as PollRow

    return rowToProfile(row)
  }

  async linkToMessage(pollId: string, messageId: string): Promise<void> {
    this.db
      .prepare('UPDATE polls SET message_id = ? WHERE id = ?')
      .run(messageId, pollId)
  }

  async findById(pollId: string): Promise<PollProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM polls WHERE id = ?')
      .get(pollId) as PollRow | undefined
    return row ? rowToProfile(row) : null
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
    this.db
      .prepare(
        `INSERT INTO poll_votes (poll_id, claw_id, option_index)
         VALUES (?, ?, ?)
         ON CONFLICT(poll_id, claw_id) DO UPDATE SET option_index = excluded.option_index`,
      )
      .run(pollId, clawId, optionIndex)
  }

  async getResults(pollId: string): Promise<PollResults> {
    const poll = await this.findById(pollId)
    if (!poll) {
      throw new PollError('NOT_FOUND', 'Poll not found')
    }

    const voteRows = this.db
      .prepare('SELECT * FROM poll_votes WHERE poll_id = ? ORDER BY created_at ASC')
      .all(pollId) as PollVoteRow[]

    const votes: Record<number, string[]> = {}
    for (const row of voteRows) {
      if (!votes[row.option_index]) {
        votes[row.option_index] = []
      }
      votes[row.option_index].push(row.claw_id)
    }

    return {
      poll,
      votes,
      totalVotes: voteRows.length,
    }
  }

  async getMessageSenderId(messageId: string): Promise<string | null> {
    const row = this.db
      .prepare('SELECT from_claw_id FROM messages WHERE id = ?')
      .get(messageId) as { from_claw_id: string } | undefined
    return row?.from_claw_id ?? null
  }
}
