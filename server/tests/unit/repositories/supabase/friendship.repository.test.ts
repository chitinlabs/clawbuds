import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseFriendshipRepository } from '../../../../src/db/repositories/supabase/friendship.repository.js'
import { createQueryBuilder } from './mock-supabase-client.js'

function createMockClient() {
  return { from: vi.fn() }
}

function makeFriendshipRow(overrides: Record<string, any> = {}) {
  return {
    id: 'fr_001',
    requester_id: 'alice',
    accepter_id: 'bob',
    status: 'pending',
    created_at: '2025-01-01T00:00:00Z',
    accepted_at: null,
    ...overrides,
  }
}

describe('SupabaseFriendshipRepository', () => {
  let client: ReturnType<typeof createMockClient>
  let repo: SupabaseFriendshipRepository

  beforeEach(() => {
    client = createMockClient()
    repo = new SupabaseFriendshipRepository(client as any)
  })

  describe('findById', () => {
    it('should return friendship record when found', async () => {
      const row = makeFriendshipRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('fr_001')

      expect(builder.eq).toHaveBeenCalledWith('id', 'fr_001')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('fr_001')
      expect(result!.requesterId).toBe('alice')
      expect(result!.accepterId).toBe('bob')
      expect(result!.status).toBe('pending')
    })

    it('should return null on PGRST116', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('findByClawIds', () => {
    it('should use .or() for bidirectional lookup', async () => {
      const row = makeFriendshipRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findByClawIds('alice', 'bob')

      expect(builder.or).toHaveBeenCalled()
      const orArg = builder.or.mock.calls[0][0]
      expect(orArg).toContain('alice')
      expect(orArg).toContain('bob')
      expect(result).not.toBeNull()
      expect(result!.requesterId).toBe('alice')
    })

    it('should return null when no friendship exists', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.findByClawIds('alice', 'charlie')

      expect(result).toBeNull()
    })
  })

  describe('sendFriendRequest', () => {
    it('should insert a pending friendship', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.sendFriendRequest('alice', 'bob')

      expect(client.from).toHaveBeenCalledWith('friendships')
      expect(builder.insert).toHaveBeenCalledWith({
        requester_id: 'alice',
        accepter_id: 'bob',
        status: 'pending',
      })
    })

    it('should throw on error', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { message: 'constraint violation' },
      })
      client.from.mockReturnValue(builder)

      await expect(repo.sendFriendRequest('alice', 'bob'))
        .rejects.toThrow('Failed to send friend request')
    })
  })

  describe('acceptFriendRequestById', () => {
    it('should update status to accepted', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.acceptFriendRequestById('fr_001')

      expect(builder.update).toHaveBeenCalled()
      const updateArg = builder.update.mock.calls[0][0]
      expect(updateArg.status).toBe('accepted')
      expect(updateArg.accepted_at).toBeDefined()
      expect(builder.eq).toHaveBeenCalledWith('id', 'fr_001')
    })
  })

  describe('rejectFriendRequestById', () => {
    it('should update status to rejected', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.rejectFriendRequestById('fr_001')

      expect(builder.update).toHaveBeenCalledWith({ status: 'rejected' })
      expect(builder.eq).toHaveBeenCalledWith('id', 'fr_001')
    })
  })

  describe('areFriends', () => {
    it('should return true when count > 0', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 1 })
      client.from.mockReturnValue(builder)

      const result = await repo.areFriends('alice', 'bob')

      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
      expect(builder.eq).toHaveBeenCalledWith('status', 'accepted')
      expect(builder.or).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should return false when count is 0', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 0 })
      client.from.mockReturnValue(builder)

      const result = await repo.areFriends('alice', 'charlie')

      expect(result).toBe(false)
    })
  })

  describe('listFriends', () => {
    it('should return friend profiles with joined data', async () => {
      const rows = [
        {
          id: 'fr_001',
          requester_id: 'alice',
          accepter_id: 'bob',
          status: 'accepted',
          created_at: '2025-01-01T00:00:00Z',
          accepted_at: '2025-01-02T00:00:00Z',
          requester: { claw_id: 'alice', display_name: 'Alice', bio: 'Hi', avatar_url: null },
          accepter: { claw_id: 'bob', display_name: 'Bob', bio: 'Hey', avatar_url: 'https://img.test/bob.png' },
        },
      ]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.listFriends('alice')

      expect(result).toHaveLength(1)
      // Alice is the requester, so friend should be Bob (the accepter)
      expect(result[0].clawId).toBe('bob')
      expect(result[0].displayName).toBe('Bob')
      expect(result[0].friendshipId).toBe('fr_001')
      expect(result[0].friendsSince).toBe('2025-01-02T00:00:00Z')
    })
  })

  describe('listPendingRequests', () => {
    it('should return pending requests for accepter', async () => {
      const rows = [makeFriendshipRow({ status: 'pending' })]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.listPendingRequests('bob')

      expect(builder.eq).toHaveBeenCalledWith('accepter_id', 'bob')
      expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
      expect(result).toHaveLength(1)
      expect(result[0].fromClawId).toBe('alice')
      expect(result[0].toClawId).toBe('bob')
    })
  })

  describe('getFriendshipStatus', () => {
    it('should return status when friendship exists', async () => {
      const builder = createQueryBuilder({ data: { status: 'accepted' }, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.getFriendshipStatus('alice', 'bob')

      expect(result).toBe('accepted')
    })

    it('should return null when no friendship', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.getFriendshipStatus('alice', 'charlie')

      expect(result).toBeNull()
    })
  })

  describe('removeFriend', () => {
    it('should delete the friendship row', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.removeFriend('alice', 'bob')

      expect(builder.delete).toHaveBeenCalled()
      expect(builder.or).toHaveBeenCalled()
    })
  })

  describe('blockUser', () => {
    it('should remove existing friendship then insert blocked', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.blockUser('alice', 'bob')

      // Should call from('friendships') for both delete and insert
      expect(client.from).toHaveBeenCalledWith('friendships')
      expect(builder.insert).toHaveBeenCalledWith({
        requester_id: 'alice',
        accepter_id: 'bob',
        status: 'blocked',
      })
    })
  })

  describe('countFriends', () => {
    it('should count accepted friendships', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 5 })
      client.from.mockReturnValue(builder)

      const result = await repo.countFriends('alice')

      expect(builder.or).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('status', 'accepted')
      expect(result).toBe(5)
    })
  })

  describe('countPendingRequests', () => {
    it('should count pending requests for accepter', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 3 })
      client.from.mockReturnValue(builder)

      const result = await repo.countPendingRequests('bob')

      expect(builder.eq).toHaveBeenCalledWith('accepter_id', 'bob')
      expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
      expect(result).toBe(3)
    })
  })
})
