/**
 * Supabase FriendModelRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseFriendModelRepository } from '../../../../src/db/repositories/supabase/friend-model.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const mockRow = {
  claw_id: 'claw-a',
  friend_id: 'claw-b',
  last_known_state: '最近在研究 Rust',
  inferred_interests: ['Rust', 'Systems'],
  expertise_tags: { Rust: 0.35, Systems: 0.3 },
  last_heartbeat_at: '2026-02-18T10:00:00Z',
  last_interaction_at: null,
  inferred_needs: null,
  emotional_tone: null,
  knowledge_gaps: null,
  updated_at: '2026-02-18T10:00:00Z',
}

describe('SupabaseFriendModelRepository', () => {
  let repo: SupabaseFriendModelRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseFriendModelRepository(client)
  })

  // ─────────────────────────────────────────────
  // get
  // ─────────────────────────────────────────────
  describe('get', () => {
    it('should return null when not found (PGRST116)', async () => {
      mockFrom('friend_models', notFoundBuilder())
      const result = await repo.get('claw-a', 'claw-b')
      expect(result).toBeNull()
    })

    it('should return a mapped FriendModelRecord on success', async () => {
      mockFrom('friend_models', successBuilder(mockRow))
      const result = await repo.get('claw-a', 'claw-b')
      expect(result).not.toBeNull()
      expect(result!.clawId).toBe('claw-a')
      expect(result!.friendId).toBe('claw-b')
      expect(result!.lastKnownState).toBe('最近在研究 Rust')
      expect(result!.inferredInterests).toEqual(['Rust', 'Systems'])
      expect(result!.expertiseTags).toEqual({ Rust: 0.35, Systems: 0.3 })
      expect(result!.lastHeartbeatAt).toBe('2026-02-18T10:00:00Z')
      expect(result!.lastInteractionAt).toBeNull()
      expect(result!.inferredNeeds).toBeNull()
      expect(result!.emotionalTone).toBeNull()
      expect(result!.knowledgeGaps).toBeNull()
    })

    it('should throw on unexpected error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(repo.get('claw-a', 'claw-b')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getAll
  // ─────────────────────────────────────────────
  describe('getAll', () => {
    it('should return empty array when no rows', async () => {
      mockFrom('friend_models', successBuilder([]))
      const result = await repo.getAll('claw-a')
      expect(result).toEqual([])
    })

    it('should return mapped records', async () => {
      mockFrom('friend_models', successBuilder([mockRow]))
      const result = await repo.getAll('claw-a')
      expect(result).toHaveLength(1)
      expect(result[0].friendId).toBe('claw-b')
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(repo.getAll('claw-a')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should insert successfully', async () => {
      mockFrom('friend_models', successBuilder(null))
      await expect(repo.create({ clawId: 'claw-a', friendId: 'claw-b' })).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('unique violation'))
      await expect(repo.create({ clawId: 'claw-a', friendId: 'claw-b' })).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // updateFromHeartbeat
  // ─────────────────────────────────────────────
  describe('updateFromHeartbeat', () => {
    it('should update successfully', async () => {
      mockFrom('friend_models', successBuilder(null))
      await expect(
        repo.updateFromHeartbeat('claw-a', 'claw-b', {
          inferredInterests: ['AI'],
          expertiseTags: { AI: 0.3 },
          lastHeartbeatAt: '2026-02-18T10:00:00Z',
        })
      ).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(
        repo.updateFromHeartbeat('claw-a', 'claw-b', {
          inferredInterests: [],
          expertiseTags: {},
          lastHeartbeatAt: '2026-02-18T10:00:00Z',
        })
      ).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // touchInteraction
  // ─────────────────────────────────────────────
  describe('touchInteraction', () => {
    it('should update lastInteractionAt successfully', async () => {
      mockFrom('friend_models', successBuilder(null))
      await expect(repo.touchInteraction('claw-a', 'claw-b')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(repo.touchInteraction('claw-a', 'claw-b')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // updateLayer1Fields
  // ─────────────────────────────────────────────
  describe('updateLayer1Fields', () => {
    it('should update Layer 1 fields successfully', async () => {
      mockFrom('friend_models', successBuilder(null))
      await expect(
        repo.updateLayer1Fields('claw-a', 'claw-b', {
          emotionalTone: 'positive',
          inferredNeeds: ['mentoring'],
          knowledgeGaps: ['systems design'],
        })
      ).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(
        repo.updateLayer1Fields('claw-a', 'claw-b', { emotionalTone: 'positive' })
      ).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────
  describe('delete', () => {
    it('should delete successfully', async () => {
      mockFrom('friend_models', successBuilder(null))
      await expect(repo.delete('claw-a', 'claw-b')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('friend_models', errorBuilder('DB error'))
      await expect(repo.delete('claw-a', 'claw-b')).rejects.toThrow()
    })
  })
})
