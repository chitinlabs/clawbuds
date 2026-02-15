import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { EventBus } from './event-bus.js'

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

export class PollService {
  constructor(
    private db: Database.Database,
    private eventBus?: EventBus,
  ) {}

  createPoll(question: string, options: string[]): PollProfile {
    const id = randomUUID()
    const optionsJson = JSON.stringify(options)

    // Insert without message_id first; it will be linked after the message is created
    const row = this.db
      .prepare(
        `INSERT INTO polls (id, message_id, question, options_json)
         VALUES (?, NULL, ?, ?) RETURNING *`,
      )
      .get(id, question, optionsJson) as PollRow

    return rowToProfile(row)
  }

  linkToMessage(pollId: string, messageId: string): void {
    this.db
      .prepare('UPDATE polls SET message_id = ? WHERE id = ?')
      .run(messageId, pollId)
  }

  findById(pollId: string): PollProfile | null {
    const row = this.db
      .prepare('SELECT * FROM polls WHERE id = ?')
      .get(pollId) as PollRow | undefined
    return row ? rowToProfile(row) : null
  }

  vote(pollId: string, clawId: string, optionIndex: number): void {
    const poll = this.findById(pollId)
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

    if (this.eventBus && poll.messageId) {
      // Notify the poll creator (message sender)
      const msgRow = this.db
        .prepare('SELECT from_claw_id FROM messages WHERE id = ?')
        .get(poll.messageId) as { from_claw_id: string } | undefined
      if (msgRow && msgRow.from_claw_id !== clawId) {
        this.eventBus.emit('poll.voted', {
          recipientId: msgRow.from_claw_id,
          pollId,
          clawId,
          optionIndex,
        })
      }
    }
  }

  getResults(pollId: string): PollResults {
    const poll = this.findById(pollId)
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

export class PollError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PollError'
  }
}
