/**
 * Cache Integration Tests
 * 测试 ClawService 与 ICacheService 的集成行为
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDatabase } from '../../../src/db/database.js'
import { SQLiteClawRepository } from '../../../src/db/repositories/sqlite/claw.repository.js'
import { ClawService } from '../../../src/services/claw.service.js'
import { MemoryCacheService } from '../../../src/cache/memory/memory-cache.service.js'
import { CacheFactory } from '../../../src/cache/factory.js'
import { generateKeyPair, sign, buildSignMessage } from '../../../src/lib/sign-protocol.js'

describe('Cache Service Integration', () => {
  let db: Database.Database
  let cache: MemoryCacheService
  let clawService: ClawService

  beforeEach(() => {
    db = createDatabase(':memory:')
    cache = new MemoryCacheService()
    const repo = new SQLiteClawRepository(db)
    clawService = new ClawService(repo, cache)
  })

  afterEach(async () => {
    await cache.flush()
    db.close()
  })

  describe('ClawService with cache', () => {
    it('should cache findById results', async () => {
      const keys = generateKeyPair()
      const claw = await clawService.register(keys.publicKey, 'Alice')

      // First call: should hit DB, cache miss
      const result1 = await clawService.findById(claw.clawId)
      expect(result1).toBeDefined()
      expect(result1!.displayName).toBe('Alice')

      // Verify it's now cached
      const cached = await cache.get(`claw:${claw.clawId}`)
      expect(cached).toBeDefined()

      // Second call: should hit cache
      const result2 = await clawService.findById(claw.clawId)
      expect(result2).toBeDefined()
      expect(result2!.displayName).toBe('Alice')
    })

    it('should invalidate cache on profile update', async () => {
      const keys = generateKeyPair()
      const claw = await clawService.register(keys.publicKey, 'Alice')

      // Populate cache
      await clawService.findById(claw.clawId)
      expect(await cache.exists(`claw:${claw.clawId}`)).toBe(true)

      // Update profile
      await clawService.updateProfile(claw.clawId, { displayName: 'Alice Updated' })

      // Cache should be invalidated
      expect(await cache.exists(`claw:${claw.clawId}`)).toBe(false)

      // Next findById should fetch from DB and re-cache
      const result = await clawService.findById(claw.clawId)
      expect(result!.displayName).toBe('Alice Updated')
      expect(await cache.exists(`claw:${claw.clawId}`)).toBe(true)
    })

    it('should invalidate cache on extended profile update', async () => {
      const keys = generateKeyPair()
      const claw = await clawService.register(keys.publicKey, 'Alice')

      await clawService.findById(claw.clawId)
      expect(await cache.exists(`claw:${claw.clawId}`)).toBe(true)

      await clawService.updateExtendedProfile(claw.clawId, {
        displayName: 'Alice Pro',
        bio: 'Updated bio',
      })

      expect(await cache.exists(`claw:${claw.clawId}`)).toBe(false)
    })

    it('should not cache null results', async () => {
      const result = await clawService.findById('claw_nonexistent')
      expect(result).toBeNull()
      expect(await cache.exists('claw:claw_nonexistent')).toBe(false)
    })
  })

  describe('ClawService without cache', () => {
    it('should work without cache (backward compatible)', async () => {
      const repo = new SQLiteClawRepository(db)
      const serviceNoCache = new ClawService(repo)

      const keys = generateKeyPair()
      const claw = await serviceNoCache.register(keys.publicKey, 'Bob')
      const result = await serviceNoCache.findById(claw.clawId)
      expect(result).toBeDefined()
      expect(result!.displayName).toBe('Bob')
    })
  })

  describe('CacheFactory', () => {
    it('should create memory cache', async () => {
      const cache = CacheFactory.create({ cacheType: 'memory' })
      expect(cache).toBeDefined()
      await expect(cache.ping()).resolves.toBe(true)
    })

    it('should create noop cache when disabled', async () => {
      const cache = CacheFactory.create({ cacheType: 'memory', enabled: false })
      await cache.set('key', 'value')
      const result = await cache.get('key')
      expect(result).toBeNull() // NoOp always returns null
    })

    it('should throw for redis without instance', () => {
      expect(() =>
        CacheFactory.create({ cacheType: 'redis' })
      ).toThrow('Redis instance is required')
    })
  })
})
