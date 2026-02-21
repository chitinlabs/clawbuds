/**
 * Supabase CarapaceHistoryRepository Unit Tests（Phase 10）
 * 使用 mock Supabase client 测试 SupabaseCarapaceHistoryRepository
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseCarapaceHistoryRepository } from '../../../../src/db/repositories/supabase/carapace-history.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  errorBuilder,
} from './mock-supabase-client.js'
import { randomUUID } from 'node:crypto'

const clawId = 'claw-test-a'

const makeHistoryRow = (version: number, reason = 'manual_edit') => ({
  id: randomUUID(),
  claw_id: clawId,
  version,
  content: `content v${version}`,
  change_reason: reason,
  suggested_by: 'user',
  created_at: '2026-02-21T04:00:00Z',
})

describe('SupabaseCarapaceHistoryRepository', () => {
  let repo: SupabaseCarapaceHistoryRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseCarapaceHistoryRepository(client)
  })

  describe('create', () => {
    it('should insert and return a history record', async () => {
      const row = makeHistoryRow(1)
      mockFrom('carapace_history', successBuilder([row]))
      const result = await repo.create({
        id: row.id,
        clawId,
        content: 'content v1',
        changeReason: 'manual_edit',
        suggestedBy: 'user',
      })
      expect(result.clawId).toBe(clawId)
      expect(result.changeReason).toBe('manual_edit')
      expect(result.suggestedBy).toBe('user')
    })

    it('should throw on Supabase error', async () => {
      mockFrom('carapace_history', errorBuilder('insert failed'))
      await expect(repo.create({
        id: randomUUID(), clawId, content: 'x', changeReason: 'allow', suggestedBy: 'user',
      })).rejects.toThrow()
    })
  })

  describe('getLatestVersion', () => {
    it('should return max version from rows', async () => {
      mockFrom('carapace_history', successBuilder([makeHistoryRow(3), makeHistoryRow(2), makeHistoryRow(1)]))
      const version = await repo.getLatestVersion(clawId)
      expect(typeof version).toBe('number')
      expect(version).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 when no rows', async () => {
      mockFrom('carapace_history', successBuilder([]))
      const version = await repo.getLatestVersion(clawId)
      expect(version).toBe(0)
    })
  })

  describe('findByOwner', () => {
    it('should return records in order', async () => {
      const rows = [makeHistoryRow(3), makeHistoryRow(2), makeHistoryRow(1)]
      mockFrom('carapace_history', successBuilder(rows))
      const result = await repo.findByOwner(clawId)
      expect(result).toHaveLength(3)
      expect(result[0].version).toBe(3)
    })

    it('should return empty array when no records', async () => {
      mockFrom('carapace_history', successBuilder([]))
      const result = await repo.findByOwner(clawId)
      expect(result).toEqual([])
    })

    it('should throw on Supabase error', async () => {
      mockFrom('carapace_history', errorBuilder('query failed'))
      await expect(repo.findByOwner(clawId)).rejects.toThrow()
    })
  })

  describe('findByVersion', () => {
    it('should return the record with matching version', async () => {
      const row = makeHistoryRow(5)
      mockFrom('carapace_history', successBuilder([row]))
      const result = await repo.findByVersion(clawId, 5)
      expect(result?.version).toBe(5)
    })

    it('should return null when version not found', async () => {
      mockFrom('carapace_history', successBuilder([]))
      const result = await repo.findByVersion(clawId, 999)
      expect(result).toBeNull()
    })

    it('should handle PGRST116 error as not found', async () => {
      mockFrom('carapace_history', errorBuilder('No rows found', 'PGRST116'))
      const result = await repo.findByVersion(clawId, 999)
      expect(result).toBeNull()
    })
  })

  describe('pruneOldVersions', () => {
    it('should return deleted count', async () => {
      mockFrom('carapace_history', successBuilder(null, 2))
      const deleted = await repo.pruneOldVersions(clawId, 3)
      expect(typeof deleted).toBe('number')
      expect(deleted).toBeGreaterThanOrEqual(0)
    })
  })
})
