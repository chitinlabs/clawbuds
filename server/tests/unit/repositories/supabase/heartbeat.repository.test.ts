/**
 * Supabase HeartbeatRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseHeartbeatRepository } from '../../../../src/db/repositories/supabase/heartbeat.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
  createQueryBuilder,
} from './mock-supabase-client.js'

describe('SupabaseHeartbeatRepository', () => {
  let repo: SupabaseHeartbeatRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseHeartbeatRepository(client)
  })

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe('create', () => {
    it('should insert a heartbeat record successfully', async () => {
      mockFrom('heartbeats', successBuilder(null))

      await expect(
        repo.create({
          id: 'hb-001',
          fromClawId: 'claw-a',
          toClawId: 'claw-b',
          interests: ['tech'],
          availability: '工作日',
          recentTopics: 'Rust',
          isKeepalive: false,
        }),
      ).resolves.toBeUndefined()
    })

    it('should throw on insert error', async () => {
      mockFrom('heartbeats', errorBuilder('DB error'))

      await expect(
        repo.create({
          id: 'hb-err',
          fromClawId: 'claw-a',
          toClawId: 'claw-b',
          isKeepalive: false,
        }),
      ).rejects.toThrow()
    })

    it('should create keepalive heartbeat with null payload fields', async () => {
      mockFrom('heartbeats', successBuilder(null))

      await expect(
        repo.create({
          id: 'hb-keepalive',
          fromClawId: 'claw-a',
          toClawId: 'claw-b',
          isKeepalive: true,
        }),
      ).resolves.toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────
  // getLatest
  // ─────────────────────────────────────────────
  describe('getLatest', () => {
    it('should return null when no heartbeat found (PGRST116)', async () => {
      mockFrom('heartbeats', notFoundBuilder())

      const result = await repo.getLatest('claw-a', 'claw-b')
      expect(result).toBeNull()
    })

    it('should return mapped HeartbeatRecord on success', async () => {
      const row = {
        id: 'hb-001',
        from_claw_id: 'claw-a',
        to_claw_id: 'claw-b',
        interests: ['tech', 'design'],
        availability: '工作日',
        recent_topics: 'Rust',
        is_keepalive: false,
        created_at: '2026-02-18T00:00:00.000Z',
      }
      mockFrom('heartbeats', successBuilder(row))

      const result = await repo.getLatest('claw-a', 'claw-b')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('hb-001')
      expect(result!.interests).toEqual(['tech', 'design'])
      expect(result!.isKeepalive).toBe(false)
    })

    it('should throw on unexpected error', async () => {
      mockFrom('heartbeats', errorBuilder('unexpected', 'DB_ERROR'))

      await expect(repo.getLatest('claw-a', 'claw-b')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getLatestForClaw
  // ─────────────────────────────────────────────
  describe('getLatestForClaw', () => {
    it('should return empty array when no heartbeats', async () => {
      mockFrom('heartbeats', successBuilder([]))

      const results = await repo.getLatestForClaw('claw-b')
      expect(results).toEqual([])
    })

    it('should return list of HeartbeatRecords', async () => {
      const rows = [
        {
          id: 'hb-a',
          from_claw_id: 'claw-a',
          to_claw_id: 'claw-b',
          interests: ['tech'],
          availability: null,
          recent_topics: null,
          is_keepalive: false,
          created_at: '2026-02-18T00:00:00.000Z',
        },
      ]
      mockFrom('heartbeats', successBuilder(rows))

      const results = await repo.getLatestForClaw('claw-b')
      expect(results).toHaveLength(1)
      expect(results[0].fromClawId).toBe('claw-a')
    })

    it('should throw on error', async () => {
      mockFrom('heartbeats', errorBuilder('error'))

      await expect(repo.getLatestForClaw('claw-b')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getSince
  // ─────────────────────────────────────────────
  describe('getSince', () => {
    it('should return records created after since date', async () => {
      const rows = [
        {
          id: 'hb-1',
          from_claw_id: 'claw-a',
          to_claw_id: 'claw-b',
          interests: null,
          availability: null,
          recent_topics: null,
          is_keepalive: true,
          created_at: '2026-02-18T01:00:00.000Z',
        },
      ]
      mockFrom('heartbeats', successBuilder(rows))

      const results = await repo.getSince('claw-b', '2026-02-18T00:00:00.000Z')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('hb-1')
    })

    it('should throw on error', async () => {
      mockFrom('heartbeats', errorBuilder('DB error'))
      await expect(repo.getSince('claw-b', '2026-02-18T00:00:00.000Z')).rejects.toThrow()
    })
  })

  // ─────────────────────────────────────────────
  // getLatestForClaw — deduplication
  // ─────────────────────────────────────────────
  describe('getLatestForClaw (deduplication)', () => {
    it('should deduplicate and return only latest per sender', async () => {
      const rows = [
        {
          id: 'hb-new',
          from_claw_id: 'claw-a',
          to_claw_id: 'claw-b',
          interests: ['tech'],
          availability: null,
          recent_topics: null,
          is_keepalive: false,
          created_at: '2026-02-18T02:00:00.000Z',
        },
        {
          id: 'hb-old',
          from_claw_id: 'claw-a',
          to_claw_id: 'claw-b',
          interests: ['games'],
          availability: null,
          recent_topics: null,
          is_keepalive: false,
          created_at: '2026-02-18T01:00:00.000Z',
        },
      ]
      mockFrom('heartbeats', successBuilder(rows))

      const results = await repo.getLatestForClaw('claw-b')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('hb-new')
    })
  })

  // ─────────────────────────────────────────────
  // deleteOlderThan
  // ─────────────────────────────────────────────
  describe('deleteOlderThan', () => {
    it('should return count of deleted rows', async () => {
      mockFrom('heartbeats', successBuilder(null, 3))

      const deleted = await repo.deleteOlderThan('2026-02-11T00:00:00.000Z')
      expect(deleted).toBe(3)
    })

    it('should return 0 when no rows deleted', async () => {
      mockFrom('heartbeats', successBuilder(null, 0))

      const deleted = await repo.deleteOlderThan('2026-02-11T00:00:00.000Z')
      expect(deleted).toBe(0)
    })

    it('should return 0 when count is null', async () => {
      mockFrom('heartbeats', successBuilder(null, null))

      const deleted = await repo.deleteOlderThan('2026-02-11T00:00:00.000Z')
      expect(deleted).toBe(0)
    })

    it('should throw on error', async () => {
      mockFrom('heartbeats', errorBuilder('delete failed'))
      await expect(repo.deleteOlderThan('2026-02-11T00:00:00.000Z')).rejects.toThrow()
    })
  })
})
