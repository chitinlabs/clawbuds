/**
 * Supabase DiscoveryRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseDiscoveryRepository } from '../../../../src/db/repositories/supabase/discovery.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const makeRow = (overrides: Partial<{
  claw_id: string
  display_name: string
  bio: string
  claw_type: string
  tags: string[]
  avatar_url: string | null
  last_seen_at: string
}> = {}) => ({
  claw_id: 'claw-a',
  display_name: 'Alice',
  bio: 'Hello',
  claw_type: 'personal',
  tags: ['tech'],
  avatar_url: null,
  last_seen_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago = online
  ...overrides,
})

describe('SupabaseDiscoveryRepository', () => {
  let repo: SupabaseDiscoveryRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseDiscoveryRepository(client)
  })

  // ─────────────────────────────────────────────
  // search
  // ─────────────────────────────────────────────
  describe('search', () => {
    it('should return results with default limit and offset', async () => {
      const rows = [makeRow()]
      mockFrom('claws', successBuilder(rows, rows.length))

      const result = await repo.search({})
      expect(result.results).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should return empty results when none found', async () => {
      mockFrom('claws', successBuilder([], 0))

      const result = await repo.search({})
      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should return total=0 when count is null', async () => {
      mockFrom('claws', successBuilder([], null))

      const result = await repo.search({})
      expect(result.total).toBe(0)
    })

    it('should apply q filter when provided', async () => {
      const rows = [makeRow({ display_name: 'Alice Test' })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({ q: 'alice' })
      expect(result.results[0].displayName).toBe('Alice Test')
    })

    it('should apply tags filter when provided', async () => {
      const rows = [makeRow({ tags: ['tech', 'ai'] })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({ tags: ['tech'] })
      expect(result.results[0].tags).toContain('tech')
    })

    it('should apply type filter when provided', async () => {
      const rows = [makeRow({ claw_type: 'business' })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({ type: 'business' as any })
      expect(result.results[0].clawType).toBe('business')
    })

    it('should apply custom limit and offset', async () => {
      mockFrom('claws', successBuilder([], 50))

      const result = await repo.search({ limit: 5, offset: 10 })
      expect(result.total).toBe(50)
    })

    it('should throw on error', async () => {
      mockFrom('claws', errorBuilder('search failed'))
      await expect(repo.search({})).rejects.toThrow()
    })

    it('should map avatarUrl from avatar_url', async () => {
      const rows = [makeRow({ avatar_url: 'https://cdn.example.com/img.jpg' })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({})
      expect(result.results[0].avatarUrl).toBe('https://cdn.example.com/img.jpg')
    })

    it('should return undefined avatarUrl when null', async () => {
      const rows = [makeRow({ avatar_url: null })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({})
      expect(result.results[0].avatarUrl).toBeUndefined()
    })

    it('should detect online status from last_seen_at within 5 minutes', async () => {
      const rows = [
        makeRow({ last_seen_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() }), // 2 min ago
      ]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({})
      expect(result.results[0].isOnline).toBe(true)
    })

    it('should detect offline status from last_seen_at older than 5 minutes', async () => {
      const rows = [
        makeRow({ last_seen_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }), // 10 min ago
      ]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({})
      expect(result.results[0].isOnline).toBe(false)
    })

    it('should handle tags as JSON string (SQLite serialization)', async () => {
      const rows = [makeRow({ tags: JSON.stringify(['rust', 'ai']) as any })]
      mockFrom('claws', successBuilder(rows, 1))

      const result = await repo.search({})
      expect(result.results[0].tags).toEqual(['rust', 'ai'])
    })
  })

  // ─────────────────────────────────────────────
  // getRecent
  // ─────────────────────────────────────────────
  describe('getRecent', () => {
    it('should return list of recent claws', async () => {
      const rows = [makeRow(), makeRow({ claw_id: 'claw-b', display_name: 'Bob' })]
      mockFrom('claws', successBuilder(rows))

      const result = await repo.getRecent(10)
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no claws', async () => {
      mockFrom('claws', successBuilder(null))

      const result = await repo.getRecent(10)
      expect(result).toEqual([])
    })

    it('should throw on error', async () => {
      mockFrom('claws', errorBuilder('query failed'))
      await expect(repo.getRecent(10)).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getPublicProfile
  // ─────────────────────────────────────────────
  describe('getPublicProfile', () => {
    it('should return profile when claw found', async () => {
      const row = makeRow()
      mockFrom('claws', successBuilder(row))

      const result = await repo.getPublicProfile('claw-a')
      expect(result).not.toBeNull()
      expect(result!.clawId).toBe('claw-a')
    })

    it('should return null when claw not found', async () => {
      mockFrom('claws', successBuilder(null))

      const result = await repo.getPublicProfile('missing')
      expect(result).toBeNull()
    })

    it('should throw on error', async () => {
      mockFrom('claws', errorBuilder('query failed'))
      await expect(repo.getPublicProfile('claw-a')).rejects.toThrow()
    })
  })
})
