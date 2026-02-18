/**
 * Supabase ReactionRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseReactionRepository } from '../../../../src/db/repositories/supabase/reaction.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

describe('SupabaseReactionRepository', () => {
  let repo: SupabaseReactionRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseReactionRepository(client)
  })

  // ─────────────────────────────────────────────
  // addReaction
  // ─────────────────────────────────────────────
  describe('addReaction', () => {
    it('should upsert reaction without error', async () => {
      mockFrom('reactions', successBuilder(null))
      await expect(repo.addReaction('msg-1', 'claw-a', '👍')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('reactions', errorBuilder('duplicate key'))
      await expect(repo.addReaction('msg-1', 'claw-a', '👍')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // removeReaction
  // ─────────────────────────────────────────────
  describe('removeReaction', () => {
    it('should delete reaction without error', async () => {
      mockFrom('reactions', successBuilder(null))
      await expect(repo.removeReaction('msg-1', 'claw-a', '👍')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('reactions', errorBuilder('delete failed'))
      await expect(repo.removeReaction('msg-1', 'claw-a', '👍')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getReactions
  // ─────────────────────────────────────────────
  describe('getReactions', () => {
    it('should return empty array when no reactions', async () => {
      mockFrom('reactions', successBuilder([]))
      const result = await repo.getReactions('msg-1')
      expect(result).toEqual([])
    })

    it('should aggregate reactions by emoji', async () => {
      const rows = [
        { emoji: '👍', claw_id: 'claw-a' },
        { emoji: '👍', claw_id: 'claw-b' },
        { emoji: '❤️', claw_id: 'claw-a' },
      ]
      mockFrom('reactions', successBuilder(rows))

      const result = await repo.getReactions('msg-1')
      expect(result).toHaveLength(2)
      const thumbs = result.find((r) => r.emoji === '👍')!
      expect(thumbs.count).toBe(2)
      expect(thumbs.clawIds).toContain('claw-a')
      expect(thumbs.clawIds).toContain('claw-b')

      const heart = result.find((r) => r.emoji === '❤️')!
      expect(heart.count).toBe(1)
    })

    it('should handle null data with empty array', async () => {
      mockFrom('reactions', successBuilder(null))
      const result = await repo.getReactions('msg-1')
      expect(result).toEqual([])
    })

    it('should throw on error', async () => {
      mockFrom('reactions', errorBuilder('query failed'))
      await expect(repo.getReactions('msg-1')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getMessageSenderId
  // ─────────────────────────────────────────────
  describe('getMessageSenderId', () => {
    it('should return sender ID when message found', async () => {
      mockFrom('messages', successBuilder({ from_claw_id: 'claw-a' }))
      const result = await repo.getMessageSenderId('msg-1')
      expect(result).toBe('claw-a')
    })

    it('should return null when data is null', async () => {
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
