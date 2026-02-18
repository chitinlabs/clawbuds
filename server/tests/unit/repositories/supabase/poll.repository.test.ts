/**
 * Supabase PollRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabasePollRepository } from '../../../../src/db/repositories/supabase/poll.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const makePollRow = (overrides: Partial<{
  id: string
  message_id: string | null
  question: string
  options_json: string[]
  created_at: string
}> = {}) => ({
  id: 'poll-1',
  message_id: null,
  question: 'Favorite language?',
  options_json: ['Rust', 'TypeScript', 'Go'],
  created_at: '2026-02-18T00:00:00Z',
  ...overrides,
})

describe('SupabasePollRepository', () => {
  let repo: SupabasePollRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabasePollRepository(client)
  })

  // ─────────────────────────────────────────────
  // createPoll
  // ─────────────────────────────────────────────
  describe('createPoll', () => {
    it('should create and return a poll', async () => {
      mockFrom('polls', successBuilder(makePollRow()))

      const result = await repo.createPoll('Favorite language?', ['Rust', 'TypeScript', 'Go'])
      expect(result.question).toBe('Favorite language?')
      expect(result.options).toEqual(['Rust', 'TypeScript', 'Go'])
      expect(result.messageId).toBeNull()
    })

    it('should parse options_json from string if needed', async () => {
      const row = makePollRow({ options_json: JSON.stringify(['A', 'B']) as any })
      mockFrom('polls', successBuilder(row))

      const result = await repo.createPoll('Q?', ['A', 'B'])
      expect(result.options).toEqual(['A', 'B'])
    })

    it('should throw when no data returned', async () => {
      mockFrom('polls', successBuilder(null))
      await expect(repo.createPoll('Q?', ['A', 'B'])).rejects.toThrow('Failed to create poll')
    })

    it('should throw on DB error', async () => {
      mockFrom('polls', errorBuilder('insert failed'))
      await expect(repo.createPoll('Q?', ['A', 'B'])).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // linkToMessage
  // ─────────────────────────────────────────────
  describe('linkToMessage', () => {
    it('should update message_id without error', async () => {
      mockFrom('polls', successBuilder(null))
      await expect(repo.linkToMessage('poll-1', 'msg-1')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('polls', errorBuilder('update failed'))
      await expect(repo.linkToMessage('poll-1', 'msg-1')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // findById
  // ─────────────────────────────────────────────
  describe('findById', () => {
    it('should return poll when found', async () => {
      mockFrom('polls', successBuilder(makePollRow()))

      const result = await repo.findById('poll-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('poll-1')
    })

    it('should return null when not found', async () => {
      mockFrom('polls', successBuilder(null))

      const result = await repo.findById('missing')
      expect(result).toBeNull()
    })

    it('should throw on error', async () => {
      mockFrom('polls', errorBuilder('query failed'))
      await expect(repo.findById('poll-1')).rejects.toThrow()
    })

    it('should handle messageId from non-null message_id', async () => {
      mockFrom('polls', successBuilder(makePollRow({ message_id: 'msg-abc' })))

      const result = await repo.findById('poll-1')
      expect(result!.messageId).toBe('msg-abc')
    })
  })

  // ─────────────────────────────────────────────
  // vote
  // ─────────────────────────────────────────────
  describe('vote', () => {
    it('should throw when poll does not exist', async () => {
      // findById returns null
      mockFrom('polls', successBuilder(null))

      await expect(repo.vote('poll-1', 'claw-a', 0)).rejects.toThrow('Poll not found')
    })

    it('should throw when option index is out of bounds', async () => {
      mockFrom('polls', successBuilder(makePollRow()))

      await expect(repo.vote('poll-1', 'claw-a', 99)).rejects.toThrow('Invalid option index')
    })

    it('should throw when option index is negative', async () => {
      mockFrom('polls', successBuilder(makePollRow()))

      await expect(repo.vote('poll-1', 'claw-a', -1)).rejects.toThrow('Invalid option index')
    })

    it('should record vote successfully', async () => {
      let pollsCallCount = 0
      client.from = (tableName: string) => {
        if (tableName === 'polls') {
          pollsCallCount++
          return successBuilder(makePollRow()) // findById returns poll
        }
        if (tableName === 'poll_votes') {
          return successBuilder(null) // upsert succeeds
        }
        return successBuilder(null)
      }

      await expect(repo.vote('poll-1', 'claw-a', 0)).resolves.toBeUndefined()
    })

    it('should throw on upsert error', async () => {
      let pollsCallCount = 0
      client.from = (tableName: string) => {
        if (tableName === 'polls') {
          pollsCallCount++
          return successBuilder(makePollRow())
        }
        if (tableName === 'poll_votes') {
          return errorBuilder('upsert failed')
        }
        return successBuilder(null)
      }

      await expect(repo.vote('poll-1', 'claw-a', 0)).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getResults
  // ─────────────────────────────────────────────
  describe('getResults', () => {
    it('should throw when poll does not exist', async () => {
      mockFrom('polls', successBuilder(null))

      await expect(repo.getResults('missing')).rejects.toThrow('Poll not found')
    })

    it('should return results with vote tallies', async () => {
      const voteRows = [
        { poll_id: 'poll-1', claw_id: 'claw-a', option_index: 0, created_at: '2026-01-01T00:00:00Z' },
        { poll_id: 'poll-1', claw_id: 'claw-b', option_index: 0, created_at: '2026-01-01T00:00:01Z' },
        { poll_id: 'poll-1', claw_id: 'claw-c', option_index: 1, created_at: '2026-01-01T00:00:02Z' },
      ]

      let callCount = 0
      client.from = (tableName: string) => {
        callCount++
        if (tableName === 'polls') {
          return successBuilder(makePollRow())
        }
        if (tableName === 'poll_votes') {
          return successBuilder(voteRows)
        }
        return successBuilder(null)
      }

      const result = await repo.getResults('poll-1')
      expect(result.totalVotes).toBe(3)
      expect(result.votes[0]).toHaveLength(2)
      expect(result.votes[1]).toHaveLength(1)
    })

    it('should return empty votes when no one voted', async () => {
      client.from = (tableName: string) => {
        if (tableName === 'polls') return successBuilder(makePollRow())
        if (tableName === 'poll_votes') return successBuilder([])
        return successBuilder(null)
      }

      const result = await repo.getResults('poll-1')
      expect(result.totalVotes).toBe(0)
      expect(result.votes).toEqual({})
    })

    it('should handle null voteRows with empty votes', async () => {
      client.from = (tableName: string) => {
        if (tableName === 'polls') return successBuilder(makePollRow())
        if (tableName === 'poll_votes') return successBuilder(null)
        return successBuilder(null)
      }

      const result = await repo.getResults('poll-1')
      expect(result.totalVotes).toBe(0)
    })

    it('should throw on vote query error', async () => {
      client.from = (tableName: string) => {
        if (tableName === 'polls') return successBuilder(makePollRow())
        if (tableName === 'poll_votes') return errorBuilder('query failed')
        return successBuilder(null)
      }

      await expect(repo.getResults('poll-1')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getMessageSenderId
  // ─────────────────────────────────────────────
  describe('getMessageSenderId', () => {
    it('should return sender ID when found', async () => {
      mockFrom('messages', successBuilder({ from_claw_id: 'claw-a' }))
      const result = await repo.getMessageSenderId('msg-1')
      expect(result).toBe('claw-a')
    })

    it('should return null when no data', async () => {
      mockFrom('messages', successBuilder(null))
      const result = await repo.getMessageSenderId('msg-1')
      expect(result).toBeNull()
    })

    it('should throw on error', async () => {
      mockFrom('messages', errorBuilder('query failed'))
      await expect(repo.getMessageSenderId('msg-1')).rejects.toThrow()
    })
  })
})
