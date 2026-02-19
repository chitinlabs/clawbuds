/**
 * Supabase PearlRepository Unit Tests
 * 使用 Mock Supabase Client，验证各方法的 camelCase 转换和错误处理
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SupabasePearlRepository } from '../../../../src/db/repositories/supabase/pearl.repository.js'
import {
  createMockSupabaseClient,
  successBuilder,
  notFoundBuilder,
  errorBuilder,
} from './mock-supabase-client.js'

const pearlMetaRow = {
  id: 'uuid-pearl-1',
  owner_id: 'uuid-owner-1',
  type: 'insight',
  trigger_text: 'test trigger',
  domain_tags: ['AI', 'design'],          // JSONB → already parsed
  luster: 0.5,
  shareability: 'friends_only',
  share_conditions: null,
  created_at: '2026-02-19T00:00:00.000Z',
  updated_at: '2026-02-19T00:00:00.000Z',
}

const pearlContentRow = {
  ...pearlMetaRow,
  body: 'test body content',
  context: 'test context',
  origin_type: 'manual',
}

const refRow = {
  id: 'uuid-ref-1',
  pearl_id: 'uuid-pearl-1',
  type: 'source',
  content: 'https://example.com',
  created_at: '2026-02-19T00:00:00.000Z',
}

describe('SupabasePearlRepository', () => {
  let repo: SupabasePearlRepository
  let mockFrom: ReturnType<typeof createMockSupabaseClient>['mockFrom']
  let client: any

  beforeEach(() => {
    const mock = createMockSupabaseClient()
    client = mock.client
    mockFrom = mock.mockFrom
    repo = new SupabasePearlRepository(client)
  })

  // ─── create ─────────────────────────────────────────────────────────────
  describe('create', () => {
    it('should create a pearl and return PearlContentRecord', async () => {
      mockFrom('pearls', successBuilder(pearlContentRow))

      const result = await repo.create({
        id: 'uuid-pearl-1',
        ownerId: 'uuid-owner-1',
        type: 'insight',
        triggerText: 'test trigger',
        domainTags: ['AI', 'design'],
        shareability: 'friends_only',
        shareConditions: null,
        body: 'test body content',
        context: 'test context',
        originType: 'manual',
      })

      expect(result.id).toBe('uuid-pearl-1')
      expect(result.ownerId).toBe('uuid-owner-1')
      expect(result.type).toBe('insight')
      expect(result.domainTags).toEqual(['AI', 'design'])
      expect(result.luster).toBe(0.5)
      expect(result.body).toBe('test body content')
      expect(result.originType).toBe('manual')
    })

    it('should throw on database error', async () => {
      mockFrom('pearls', errorBuilder('insert failed'))
      await expect(
        repo.create({
          id: 'uuid-pearl-1',
          ownerId: 'uuid-owner-1',
          type: 'insight',
          triggerText: 'test',
          domainTags: [],
          shareability: 'friends_only',
          shareConditions: null,
          body: null,
          context: null,
          originType: 'manual',
        }),
      ).rejects.toThrow()
    })
  })

  // ─── findById ───────────────────────────────────────────────────────────
  describe('findById', () => {
    it('should return null for not found pearl (PGRST116)', async () => {
      mockFrom('pearls', notFoundBuilder())
      const result = await repo.findById('non-existent', 1)
      expect(result).toBeNull()
    })

    it('level=0 should return metadata record (no body/context/originType)', async () => {
      mockFrom('pearls', successBuilder(pearlMetaRow))
      const result = await repo.findById('uuid-pearl-1', 0)
      expect(result).not.toBeNull()
      expect(result!.id).toBe('uuid-pearl-1')
      expect((result as any).body).toBeUndefined()
      expect((result as any).originType).toBeUndefined()
    })

    it('level=1 should return content record with body', async () => {
      mockFrom('pearls', successBuilder(pearlContentRow))
      const result = await repo.findById('uuid-pearl-1', 1)
      expect(result).not.toBeNull()
      expect((result as any).body).toBe('test body content')
      expect((result as any).originType).toBe('manual')
      expect((result as any).references).toBeUndefined()
    })

    it('level=2 should return full record with references', async () => {
      // First call (pearls) returns pearl, second call (pearl_references) returns refs
      mockFrom('pearls', successBuilder(pearlContentRow))
      mockFrom('pearl_references', successBuilder([refRow]))

      const result = await repo.findById('uuid-pearl-1', 2)
      expect(result).not.toBeNull()
      expect((result as any).body).toBe('test body content')
      expect((result as any).references).toBeDefined()
      expect(Array.isArray((result as any).references)).toBe(true)
    })

    it('should throw on unexpected error', async () => {
      mockFrom('pearls', errorBuilder('DB error'))
      await expect(repo.findById('uuid-pearl-1', 1)).rejects.toThrow()
    })
  })

  // ─── findByOwner ────────────────────────────────────────────────────────
  describe('findByOwner', () => {
    it('should return empty array when no pearls', async () => {
      mockFrom('pearls', successBuilder([]))
      const result = await repo.findByOwner('uuid-owner-1')
      expect(result).toEqual([])
    })

    it('should map rows to PearlMetadataRecord', async () => {
      mockFrom('pearls', successBuilder([pearlMetaRow]))
      const result = await repo.findByOwner('uuid-owner-1')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('uuid-pearl-1')
      expect(result[0].domainTags).toEqual(['AI', 'design'])
      expect((result[0] as any).body).toBeUndefined()
    })

    it('should throw on error', async () => {
      mockFrom('pearls', errorBuilder('query failed'))
      await expect(repo.findByOwner('uuid-owner-1')).rejects.toThrow()
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should update pearl and return PearlContentRecord', async () => {
      const updatedRow = { ...pearlContentRow, trigger_text: 'new trigger' }
      mockFrom('pearls', successBuilder(updatedRow))

      const result = await repo.update('uuid-pearl-1', { triggerText: 'new trigger' })
      expect(result.triggerText).toBe('new trigger')
    })

    it('should throw on error', async () => {
      mockFrom('pearls', errorBuilder('update failed'))
      await expect(repo.update('uuid-pearl-1', { triggerText: 'x' })).rejects.toThrow()
    })
  })

  // ─── updateLuster ────────────────────────────────────────────────────────
  describe('updateLuster', () => {
    it('should not throw on success', async () => {
      mockFrom('pearls', successBuilder(null))
      await expect(repo.updateLuster('uuid-pearl-1', 0.8)).resolves.not.toThrow()
    })

    it('should throw on error', async () => {
      mockFrom('pearls', errorBuilder('update failed'))
      await expect(repo.updateLuster('uuid-pearl-1', 0.8)).rejects.toThrow()
    })
  })

  // ─── delete ─────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('should not throw on success', async () => {
      mockFrom('pearls', successBuilder(null))
      await expect(repo.delete('uuid-pearl-1')).resolves.not.toThrow()
    })

    it('should throw on error', async () => {
      mockFrom('pearls', errorBuilder('delete failed'))
      await expect(repo.delete('uuid-pearl-1')).rejects.toThrow()
    })
  })

  // ─── getPearlDomainTags ──────────────────────────────────────────────────
  describe('getPearlDomainTags', () => {
    it('should return deduplicated domain tags', async () => {
      mockFrom('pearls', successBuilder([
        { domain_tags: ['AI', 'design'] },
        { domain_tags: ['AI', 'startup'] },
      ]))
      const tags = await repo.getPearlDomainTags('uuid-owner-1')
      expect(tags).toContain('AI')
      expect(tags).toContain('design')
      expect(tags).toContain('startup')
      expect(tags.filter(t => t === 'AI')).toHaveLength(1)
    })

    it('should return empty array when no pearls', async () => {
      mockFrom('pearls', successBuilder([]))
      const tags = await repo.getPearlDomainTags('uuid-owner-1')
      expect(tags).toEqual([])
    })
  })

  // ─── getRoutingCandidates ────────────────────────────────────────────────
  describe('getRoutingCandidates', () => {
    it('should return Level 0 records', async () => {
      mockFrom('pearls', successBuilder([pearlMetaRow]))
      const result = await repo.getRoutingCandidates('uuid-owner-1')
      expect(result).toHaveLength(1)
      expect((result[0] as any).body).toBeUndefined()
    })

    it('should return empty when no routing candidates', async () => {
      mockFrom('pearls', successBuilder([]))
      const result = await repo.getRoutingCandidates('uuid-owner-1')
      expect(result).toEqual([])
    })
  })

  // ─── isVisibleTo ─────────────────────────────────────────────────────────
  describe('isVisibleTo', () => {
    it('should return true if owner', async () => {
      mockFrom('pearls', successBuilder({ owner_id: 'uuid-owner-1', shareability: 'private' }))
      const visible = await repo.isVisibleTo('uuid-pearl-1', 'uuid-owner-1')
      expect(visible).toBe(true)
    })

    it('should return true if public pearl', async () => {
      mockFrom('pearls', successBuilder({ owner_id: 'uuid-owner-1', shareability: 'public' }))
      const visible = await repo.isVisibleTo('uuid-pearl-1', 'uuid-other-1')
      expect(visible).toBe(true)
    })

    it('should return false if private and not owner', async () => {
      mockFrom('pearls', successBuilder({ owner_id: 'uuid-owner-1', shareability: 'private' }))
      mockFrom('pearl_shares', successBuilder(null))
      const visible = await repo.isVisibleTo('uuid-pearl-1', 'uuid-other-1')
      expect(visible).toBe(false)
    })

    it('should return false for non-existent pearl', async () => {
      mockFrom('pearls', notFoundBuilder())
      const visible = await repo.isVisibleTo('non-existent', 'uuid-other-1')
      expect(visible).toBe(false)
    })
  })

  // ─── pearl_references ────────────────────────────────────────────────────
  describe('pearl_references', () => {
    it('addReference should create reference and return record', async () => {
      mockFrom('pearl_references', successBuilder(refRow))
      const result = await repo.addReference('uuid-pearl-1', {
        type: 'source',
        content: 'https://example.com',
      })
      expect(result.pearlId).toBe('uuid-pearl-1')
      expect(result.type).toBe('source')
      expect(result.content).toBe('https://example.com')
    })

    it('getReferences should return references array', async () => {
      mockFrom('pearl_references', successBuilder([refRow]))
      const result = await repo.getReferences('uuid-pearl-1')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('uuid-ref-1')
    })

    it('removeReference should not throw on success', async () => {
      mockFrom('pearl_references', successBuilder(null))
      await expect(repo.removeReference('uuid-ref-1')).resolves.not.toThrow()
    })
  })

  // ─── pearl_shares ─────────────────────────────────────────────────────────
  describe('pearl_shares', () => {
    const shareRow = {
      id: 'uuid-share-1',
      pearl_id: 'uuid-pearl-1',
      from_claw_id: 'uuid-owner-1',
      to_claw_id: 'uuid-other-1',
      created_at: '2026-02-19T00:00:00.000Z',
    }

    it('createShare should not throw on success', async () => {
      mockFrom('pearl_shares', successBuilder(null))
      await expect(
        repo.createShare({
          id: 'uuid-share-1',
          pearlId: 'uuid-pearl-1',
          fromClawId: 'uuid-owner-1',
          toClawId: 'uuid-other-1',
        }),
      ).resolves.not.toThrow()
    })

    it('hasBeenSharedWith should return true if share exists', async () => {
      mockFrom('pearl_shares', successBuilder(shareRow))
      const result = await repo.hasBeenSharedWith('uuid-pearl-1', 'uuid-other-1')
      expect(result).toBe(true)
    })

    it('hasBeenSharedWith should return false if not shared (PGRST116)', async () => {
      mockFrom('pearl_shares', notFoundBuilder())
      const result = await repo.hasBeenSharedWith('uuid-pearl-1', 'uuid-other-1')
      expect(result).toBe(false)
    })

    it('getReceivedPearls should return share+pearl pairs', async () => {
      const joinRow = {
        ...shareRow,
        share_id: 'uuid-share-1',
        pearl: pearlMetaRow,
      }
      mockFrom('pearl_shares', successBuilder([joinRow]))
      const result = await repo.getReceivedPearls('uuid-other-1')
      expect(result).toHaveLength(1)
      expect(result[0].share.fromClawId).toBe('uuid-owner-1')
      expect(result[0].pearl.id).toBe('uuid-pearl-1')
    })

    it('getReceivedPearls should return empty array when none', async () => {
      mockFrom('pearl_shares', successBuilder([]))
      const result = await repo.getReceivedPearls('uuid-other-1')
      expect(result).toEqual([])
    })
  })
})
