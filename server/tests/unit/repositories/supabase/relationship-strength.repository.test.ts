/**
 * Supabase RelationshipStrengthRepository Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseRelationshipStrengthRepository } from '../../../../src/db/repositories/supabase/relationship-strength.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const testDecayRate = (_: number) => 0.99

describe('SupabaseRelationshipStrengthRepository', () => {
  let repo: SupabaseRelationshipStrengthRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabaseRelationshipStrengthRepository(client)
  })

  describe('get', () => {
    it('should return null when not found (PGRST116)', async () => {
      mockFrom('relationship_strength', notFoundBuilder())
      const result = await repo.get('claw-a', 'claw-b')
      expect(result).toBeNull()
    })

    it('should return mapped record on success', async () => {
      const row = {
        claw_id: 'claw-a',
        friend_id: 'claw-b',
        strength: 0.5,
        dunbar_layer: 'casual',
        manual_override: false,
        last_interaction_at: null,
        updated_at: '2026-02-18T00:00:00Z',
      }
      mockFrom('relationship_strength', successBuilder(row))

      const result = await repo.get('claw-a', 'claw-b')
      expect(result).not.toBeNull()
      expect(result!.clawId).toBe('claw-a')
      expect(result!.strength).toBe(0.5)
      expect(result!.dunbarLayer).toBe('casual')
      expect(result!.manualOverride).toBe(false)
    })

    it('should throw on non-PGRST116 error', async () => {
      mockFrom('relationship_strength', errorBuilder('DB error', 'DB_FAIL'))
      await expect(repo.get('claw-a', 'claw-b')).rejects.toThrow('Failed to get relationship strength')
    })
  })

  describe('getAllForClaw', () => {
    it('should return empty array when no records', async () => {
      mockFrom('relationship_strength', successBuilder([]))
      const results = await repo.getAllForClaw('claw-a')
      expect(results).toEqual([])
    })

    it('should return list of records', async () => {
      const rows = [
        {
          claw_id: 'claw-a',
          friend_id: 'claw-b',
          strength: 0.8,
          dunbar_layer: 'core',
          manual_override: false,
          last_interaction_at: null,
          updated_at: '2026-02-18T00:00:00Z',
        },
      ]
      mockFrom('relationship_strength', successBuilder(rows))

      const results = await repo.getAllForClaw('claw-a')
      expect(results).toHaveLength(1)
      expect(results[0].dunbarLayer).toBe('core')
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('DB error'))
      await expect(repo.getAllForClaw('claw-a')).rejects.toThrow('Failed to get all relationships for claw')
    })
  })

  describe('create', () => {
    it('should insert a record', async () => {
      mockFrom('relationship_strength', successBuilder(null))

      await expect(
        repo.create({ clawId: 'claw-a', friendId: 'claw-b', strength: 0.5, dunbarLayer: 'casual' }),
      ).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('error'))

      await expect(
        repo.create({ clawId: 'claw-a', friendId: 'claw-b', strength: 0.5, dunbarLayer: 'casual' }),
      ).rejects.toThrow()
    })
  })

  describe('updateStrength', () => {
    it('should update without error', async () => {
      mockFrom('relationship_strength', successBuilder(null))

      await expect(repo.updateStrength('claw-a', 'claw-b', 0.75)).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('update failed'))
      await expect(repo.updateStrength('claw-a', 'claw-b', 0.75)).rejects.toThrow('Failed to update strength')
    })
  })

  describe('updateLayer', () => {
    it('should update layer and manual_override', async () => {
      mockFrom('relationship_strength', successBuilder(null))

      await expect(repo.updateLayer('claw-a', 'claw-b', 'core', true)).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('update failed'))
      await expect(repo.updateLayer('claw-a', 'claw-b', 'core', false)).rejects.toThrow('Failed to update layer')
    })
  })

  describe('touchInteraction', () => {
    it('should update last_interaction_at', async () => {
      mockFrom('relationship_strength', successBuilder(null))

      await expect(repo.touchInteraction('claw-a', 'claw-b')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('touch failed'))
      await expect(repo.touchInteraction('claw-a', 'claw-b')).rejects.toThrow('Failed to touch interaction')
    })
  })

  describe('decayAll', () => {
    it('should fetch all records and return count', async () => {
      const rows = [
        {
          claw_id: 'claw-a',
          friend_id: 'claw-b',
          strength: 0.5,
          dunbar_layer: 'casual',
          manual_override: false,
          last_interaction_at: null,
          updated_at: '2026-02-18T00:00:00Z',
        },
      ]
      // First call (select all) returns rows, subsequent calls (updates) return success
      let callCount = 0
      client.from = (tableName: string) => {
        callCount++
        if (tableName === 'relationship_strength' && callCount === 1) {
          return successBuilder(rows)
        }
        return successBuilder(null)
      }

      const affected = await repo.decayAll(testDecayRate)
      expect(affected).toBe(1)
    })

    it('should return 0 when no records exist', async () => {
      let callCount = 0
      client.from = (tableName: string) => {
        callCount++
        if (tableName === 'relationship_strength' && callCount === 1) {
          return successBuilder([])
        }
        return successBuilder(null)
      }

      const affected = await repo.decayAll(testDecayRate)
      expect(affected).toBe(0)
    })

    it('should throw when select fails', async () => {
      client.from = () => errorBuilder('select failed')
      await expect(repo.decayAll(testDecayRate)).rejects.toThrow('Failed to fetch records for decay')
    })
  })

  describe('getAtRisk', () => {
    it('should return records close to threshold with no recent interaction', async () => {
      const rows = [
        {
          claw_id: 'claw-a',
          friend_id: 'claw-b',
          strength: 0.32,
          dunbar_layer: 'active',
          manual_override: false,
          last_interaction_at: null,
          updated_at: '2026-02-10T00:00:00Z',
        },
      ]
      mockFrom('relationship_strength', successBuilder(rows))

      const results = await repo.getAtRisk('claw-a', 0.05, 7)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should return empty when no at-risk relationships', async () => {
      mockFrom('relationship_strength', successBuilder([]))

      const results = await repo.getAtRisk('claw-a', 0.05, 7)
      expect(results).toEqual([])
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('query failed'))
      await expect(repo.getAtRisk('claw-a', 0.05, 7)).rejects.toThrow('Failed to get at-risk relationships')
    })

    it('should filter out records that are not within margin of threshold', async () => {
      const rows = [
        {
          claw_id: 'claw-a',
          friend_id: 'claw-c',
          strength: 0.9,  // core layer (threshold 0.8), 0.9 - 0.8 = 0.1 > margin(0.05), not at risk
          dunbar_layer: 'core',
          manual_override: false,
          last_interaction_at: null,
          updated_at: '2026-02-10T00:00:00Z',
        },
        {
          claw_id: 'claw-a',
          friend_id: 'claw-d',
          strength: 0.81,  // core layer (threshold 0.8), 0.81 - 0.8 = 0.01 <= margin(0.05), at risk
          dunbar_layer: 'core',
          manual_override: false,
          last_interaction_at: null,
          updated_at: '2026-02-10T00:00:00Z',
        },
      ]
      mockFrom('relationship_strength', successBuilder(rows))

      const results = await repo.getAtRisk('claw-a', 0.05, 7)
      expect(results).toHaveLength(1)
      expect(results[0].friendId).toBe('claw-d')
    })
  })

  describe('delete', () => {
    it('should delete without error', async () => {
      mockFrom('relationship_strength', successBuilder(null))

      await expect(repo.delete('claw-a', 'claw-b')).resolves.toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('relationship_strength', errorBuilder('delete failed'))
      await expect(repo.delete('claw-a', 'claw-b')).rejects.toThrow('Failed to delete relationship strength')
    })
  })
})
