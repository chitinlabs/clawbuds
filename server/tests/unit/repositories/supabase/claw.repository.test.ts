import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseClawRepository } from '../../../../src/db/repositories/supabase/claw.repository.js'
import { createQueryBuilder } from './mock-supabase-client.js'

function createMockClient() {
  return { from: vi.fn() }
}

function makeClawRow(overrides: Record<string, any> = {}) {
  return {
    claw_id: 'claw_abc123',
    public_key: 'pk_abc',
    display_name: 'Alice',
    bio: 'Hello',
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    last_seen_at: '2025-01-01T00:00:00Z',
    claw_type: 'personal',
    discoverable: false,
    tags: [],
    capabilities: [],
    avatar_url: null,
    autonomy_level: 'notifier',
    autonomy_config: null,
    brain_provider: 'openai',
    notification_prefs: null,
    ...overrides,
  }
}

describe('SupabaseClawRepository', () => {
  let client: ReturnType<typeof createMockClient>
  let repo: SupabaseClawRepository

  beforeEach(() => {
    client = createMockClient()
    repo = new SupabaseClawRepository(client as any)
  })

  describe('register', () => {
    it('should insert and return a Claw', async () => {
      const row = makeClawRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.register({
        publicKey: 'pk_abc',
        displayName: 'Alice',
        bio: 'Hello',
      })

      expect(client.from).toHaveBeenCalledWith('claws')
      expect(builder.insert).toHaveBeenCalled()
      expect(builder.select).toHaveBeenCalled()
      expect(result.clawId).toBe('claw_abc123')
      expect(result.displayName).toBe('Alice')
      expect(result.bio).toBe('Hello')
    })

    it('should use provided clawId if given', async () => {
      const row = makeClawRow({ claw_id: 'custom_id' })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.register({
        clawId: 'custom_id',
        publicKey: 'pk_abc',
        displayName: 'Alice',
      })

      const insertCall = builder.insert.mock.calls[0][0]
      expect(insertCall.claw_id).toBe('custom_id')
      expect(result.clawId).toBe('custom_id')
    })

    it('should throw on insert error', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { message: 'unique violation' },
      })
      client.from.mockReturnValue(builder)

      await expect(repo.register({
        publicKey: 'pk_abc',
        displayName: 'Alice',
      })).rejects.toThrow('Failed to register claw')
    })
  })

  describe('findById', () => {
    it('should return Claw when found', async () => {
      const row = makeClawRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('claw_abc123')

      expect(builder.select).toHaveBeenCalledWith('*')
      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc123')
      expect(result).not.toBeNull()
      expect(result!.clawId).toBe('claw_abc123')
    })

    it('should return null on PGRST116 (not found)', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.findById('nonexistent')

      expect(result).toBeNull()
    })

    it('should throw on other errors', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'UNKNOWN', message: 'DB error' },
      })
      client.from.mockReturnValue(builder)

      await expect(repo.findById('abc')).rejects.toThrow('Failed to find claw')
    })
  })

  describe('findByPublicKey', () => {
    it('should find claw by public key', async () => {
      const row = makeClawRow({ public_key: 'pk_xyz' })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findByPublicKey('pk_xyz')

      expect(builder.eq).toHaveBeenCalledWith('public_key', 'pk_xyz')
      expect(result).not.toBeNull()
    })

    it('should return null when not found', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.findByPublicKey('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('findMany', () => {
    it('should return claws for given IDs', async () => {
      const rows = [makeClawRow({ claw_id: 'a' }), makeClawRow({ claw_id: 'b' })]
      const builder = createQueryBuilder({ data: rows, error: null })
      // findMany doesn't call .single(), it awaits the builder directly
      client.from.mockReturnValue(builder)

      const result = await repo.findMany(['a', 'b'])

      expect(builder.in).toHaveBeenCalledWith('claw_id', ['a', 'b'])
      expect(result).toHaveLength(2)
      expect(result[0].clawId).toBe('a')
    })

    it('should return empty array for empty input', async () => {
      const result = await repo.findMany([])

      expect(client.from).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('updateProfile', () => {
    it('should update and return updated Claw', async () => {
      const updatedRow = makeClawRow({ display_name: 'New Name' })
      const builder = createQueryBuilder({ data: updatedRow, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.updateProfile('claw_abc123', { displayName: 'New Name' })

      expect(builder.update).toHaveBeenCalledWith({ display_name: 'New Name' })
      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc123')
      expect(result!.displayName).toBe('New Name')
    })

    it('should return null when claw not found on update', async () => {
      const builder = createQueryBuilder({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      client.from.mockReturnValue(builder)

      const result = await repo.updateProfile('nonexistent', { displayName: 'X' })

      expect(result).toBeNull()
    })

    it('should call findById when no updates provided', async () => {
      const row = makeClawRow()
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.updateProfile('claw_abc123', {})

      // Should use select (findById path), not update
      expect(builder.select).toHaveBeenCalledWith('*')
      expect(result!.clawId).toBe('claw_abc123')
    })
  })

  describe('updateLastSeen', () => {
    it('should update last_seen_at', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.updateLastSeen('claw_abc123')

      expect(builder.update).toHaveBeenCalled()
      const updateCall = builder.update.mock.calls[0][0]
      expect(updateCall.last_seen_at).toBeDefined()
      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc123')
    })
  })

  describe('exists', () => {
    it('should return true when claw exists', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 1 })
      client.from.mockReturnValue(builder)

      const result = await repo.exists('claw_abc123')

      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true })
      expect(result).toBe(true)
    })

    it('should return false when claw does not exist', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 0 })
      client.from.mockReturnValue(builder)

      const result = await repo.exists('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('count', () => {
    it('should count all claws without filters', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 42 })
      client.from.mockReturnValue(builder)

      const result = await repo.count()

      expect(result).toBe(42)
    })

    it('should count with status filter', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 10 })
      client.from.mockReturnValue(builder)

      const result = await repo.count({ status: 'active' })

      expect(builder.eq).toHaveBeenCalledWith('status', 'active')
      expect(result).toBe(10)
    })

    it('should count with discoverable filter', async () => {
      const builder = createQueryBuilder({ data: null, error: null, count: 5 })
      client.from.mockReturnValue(builder)

      const result = await repo.count({ discoverable: true })

      expect(builder.eq).toHaveBeenCalledWith('discoverable', true)
      expect(result).toBe(5)
    })
  })

  describe('deactivate', () => {
    it('should set status to deactivated', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      await repo.deactivate('claw_abc123')

      expect(builder.update).toHaveBeenCalledWith({ status: 'deactivated' })
      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc123')
    })
  })

  describe('findDiscoverable', () => {
    it('should filter by discoverable and active', async () => {
      const rows = [makeClawRow({ discoverable: true })]
      const builder = createQueryBuilder({ data: rows, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.findDiscoverable()

      expect(builder.eq).toHaveBeenCalledWith('discoverable', true)
      expect(builder.eq).toHaveBeenCalledWith('status', 'active')
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(builder.range).toHaveBeenCalledWith(0, 49) // default limit 50
      expect(result).toHaveLength(1)
    })

    it('should filter by tags using contains', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      await repo.findDiscoverable({ tags: ['bot', 'ai'] })

      expect(builder.contains).toHaveBeenCalledWith('tags', ['bot', 'ai'])
    })
  })

  describe('row mapping', () => {
    it('should correctly map snake_case to camelCase', async () => {
      const row = makeClawRow({
        claw_id: 'claw_x',
        public_key: 'pk_x',
        display_name: 'X Bot',
        claw_type: 'bot',
        avatar_url: 'https://img.example.com/x.png',
        autonomy_level: 'autonomous',
        autonomy_config: { maxTokens: 100 },
        brain_provider: 'anthropic',
        notification_prefs: { mute: true },
        last_seen_at: '2025-06-01T12:00:00Z',
      })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const claw = await repo.findById('claw_x')

      expect(claw!.clawId).toBe('claw_x')
      expect(claw!.publicKey).toBe('pk_x')
      expect(claw!.displayName).toBe('X Bot')
      expect(claw!.clawType).toBe('bot')
      expect(claw!.avatarUrl).toBe('https://img.example.com/x.png')
      expect(claw!.autonomyLevel).toBe('autonomous')
      expect(claw!.autonomyConfig).toEqual({ maxTokens: 100 })
      expect(claw!.brainProvider).toBe('anthropic')
      expect(claw!.notificationPrefs).toEqual({ mute: true })
      expect(claw!.lastSeenAt).toBe('2025-06-01T12:00:00Z')
    })

    it('should map null avatar_url to undefined', async () => {
      const row = makeClawRow({ avatar_url: null })
      const builder = createQueryBuilder({ data: row, error: null })
      client.from.mockReturnValue(builder)

      const claw = await repo.findById('claw_abc')

      expect(claw!.avatarUrl).toBeUndefined()
    })
  })

  describe('savePushSubscription', () => {
    it('should upsert push subscription', async () => {
      const builder = createQueryBuilder({ data: null, error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.savePushSubscription('claw_abc', {
        id: 'sub_1',
        endpoint: 'https://push.example.com/1',
        keyP256dh: 'p256dh_key',
        keyAuth: 'auth_key',
      })

      expect(client.from).toHaveBeenCalledWith('push_subscriptions')
      expect(builder.upsert).toHaveBeenCalled()
      expect(result.id).toBe('sub_1')
      expect(result.endpoint).toBe('https://push.example.com/1')
    })
  })

  describe('deletePushSubscription', () => {
    it('should delete subscription and return true when found', async () => {
      const builder = createQueryBuilder({ data: [{ id: 'sub_1' }], error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.deletePushSubscription('claw_abc', 'https://push.example.com/1')

      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('claw_id', 'claw_abc')
      expect(builder.eq).toHaveBeenCalledWith('endpoint', 'https://push.example.com/1')
      expect(result).toBe(true)
    })

    it('should return false when not found', async () => {
      const builder = createQueryBuilder({ data: [], error: null })
      client.from.mockReturnValue(builder)

      const result = await repo.deletePushSubscription('claw_abc', 'nonexistent')

      expect(result).toBe(false)
    })
  })
})
