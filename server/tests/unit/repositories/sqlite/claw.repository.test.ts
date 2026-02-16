/**
 * SQLite Claw Repository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import type { RegisterClawDTO, UpdateClawDTO } from '../../../../src/db/repositories/interfaces/claw.repository.interface.js'

describe('SQLiteClawRepository', () => {
  let db: Database.Database
  let repository: SQLiteClawRepository

  beforeEach(() => {
    db = createTestDatabase()
    repository = new SQLiteClawRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('register', () => {
    it('should register a new claw', async () => {
      const registerData: RegisterClawDTO = {
        publicKey: 'test-public-key-123',
        displayName: 'Test Claw',
        bio: 'Test bio',
        tags: ['test', 'demo'],
        discoverable: true,
      }

      const claw = await repository.register(registerData)

      expect(claw.clawId).toBeDefined()
      expect(claw.publicKey).toBe(registerData.publicKey)
      expect(claw.displayName).toBe(registerData.displayName)
      expect(claw.bio).toBe(registerData.bio)
      expect(claw.tags).toEqual(registerData.tags)
      expect(claw.discoverable).toBe(true)
      expect(claw.status).toBe('active')
      expect(claw.createdAt).toBeDefined()
    })

    it('should register with minimal data', async () => {
      const registerData: RegisterClawDTO = {
        publicKey: 'test-public-key-456',
        displayName: 'Minimal Claw',
      }

      const claw = await repository.register(registerData)

      expect(claw.clawId).toBeDefined()
      expect(claw.bio).toBe('')
      expect(claw.tags).toEqual([])
      expect(claw.discoverable).toBe(false)
    })
  })

  describe('findById', () => {
    it('should find claw by ID', async () => {
      const registerData: RegisterClawDTO = {
        publicKey: 'test-key',
        displayName: 'Test',
      }
      const created = await repository.register(registerData)

      const found = await repository.findById(created.clawId)

      expect(found).toBeDefined()
      expect(found?.clawId).toBe(created.clawId)
    })

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent-id')
      expect(found).toBeNull()
    })
  })

  describe('findByPublicKey', () => {
    it('should find claw by public key', async () => {
      const registerData: RegisterClawDTO = {
        publicKey: 'unique-public-key',
        displayName: 'Test',
      }
      await repository.register(registerData)

      const found = await repository.findByPublicKey('unique-public-key')

      expect(found).toBeDefined()
      expect(found?.publicKey).toBe('unique-public-key')
    })

    it('should return null for non-existent public key', async () => {
      const found = await repository.findByPublicKey('non-existent-key')
      expect(found).toBeNull()
    })
  })

  describe('findMany', () => {
    it('should find multiple claws', async () => {
      const claw1 = await repository.register({
        publicKey: 'key1',
        displayName: 'Claw 1',
      })
      const claw2 = await repository.register({
        publicKey: 'key2',
        displayName: 'Claw 2',
      })

      const found = await repository.findMany([claw1.clawId, claw2.clawId])

      expect(found).toHaveLength(2)
      expect(found.map((c) => c.clawId)).toContain(claw1.clawId)
      expect(found.map((c) => c.clawId)).toContain(claw2.clawId)
    })

    it('should return empty array for empty input', async () => {
      const found = await repository.findMany([])
      expect(found).toEqual([])
    })
  })

  describe('findDiscoverable', () => {
    it('should find discoverable claws', async () => {
      await repository.register({
        publicKey: 'key1',
        displayName: 'Discoverable',
        discoverable: true,
      })
      await repository.register({
        publicKey: 'key2',
        displayName: 'Not Discoverable',
        discoverable: false,
      })

      const found = await repository.findDiscoverable()

      expect(found).toHaveLength(1)
      expect(found[0].displayName).toBe('Discoverable')
    })

    it('should filter by tags', async () => {
      await repository.register({
        publicKey: 'key1',
        displayName: 'Bot',
        tags: ['bot', 'ai'],
        discoverable: true,
      })
      await repository.register({
        publicKey: 'key2',
        displayName: 'Service',
        tags: ['service'],
        discoverable: true,
      })

      const found = await repository.findDiscoverable({ tags: ['bot'] })

      expect(found.length).toBeGreaterThan(0)
      expect(found[0].displayName).toBe('Bot')
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.register({
          publicKey: `key${i}`,
          displayName: `Claw ${i}`,
          discoverable: true,
        })
      }

      const page1 = await repository.findDiscoverable({ limit: 2, offset: 0 })
      const page2 = await repository.findDiscoverable({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].clawId).not.toBe(page2[0].clawId)
    })
  })

  describe('updateProfile', () => {
    it('should update profile fields', async () => {
      const claw = await repository.register({
        publicKey: 'key',
        displayName: 'Original',
      })

      const updates: UpdateClawDTO = {
        displayName: 'Updated',
        bio: 'New bio',
        tags: ['updated'],
      }

      const updated = await repository.updateProfile(claw.clawId, updates)

      expect(updated).toBeDefined()
      expect(updated?.displayName).toBe('Updated')
      expect(updated?.bio).toBe('New bio')
      expect(updated?.tags).toEqual(['updated'])
    })

    it('should return null for non-existent claw', async () => {
      const updated = await repository.updateProfile('non-existent', {
        displayName: 'Test',
      })
      expect(updated).toBeNull()
    })
  })

  describe('updateLastSeen', () => {
    it('should update last seen timestamp', async () => {
      const claw = await repository.register({
        publicKey: 'key',
        displayName: 'Test',
      })
      const originalLastSeen = claw.lastSeenAt

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10))

      await repository.updateLastSeen(claw.clawId)
      const updated = await repository.findById(claw.clawId)

      expect(updated?.lastSeenAt).not.toBe(originalLastSeen)
    })
  })

  describe('deactivate', () => {
    it('should deactivate claw', async () => {
      const claw = await repository.register({
        publicKey: 'key',
        displayName: 'Test',
      })

      await repository.deactivate(claw.clawId)
      const deactivated = await repository.findById(claw.clawId)

      expect(deactivated?.status).toBe('deactivated')
    })
  })

  describe('exists', () => {
    it('should return true for existing claw', async () => {
      const claw = await repository.register({
        publicKey: 'key',
        displayName: 'Test',
      })

      const exists = await repository.exists(claw.clawId)
      expect(exists).toBe(true)
    })

    it('should return false for non-existent claw', async () => {
      const exists = await repository.exists('non-existent')
      expect(exists).toBe(false)
    })
  })

  describe('count', () => {
    it('should count all claws', async () => {
      await repository.register({ publicKey: 'key1', displayName: 'Test 1' })
      await repository.register({ publicKey: 'key2', displayName: 'Test 2' })

      const count = await repository.count()
      expect(count).toBe(2)
    })

    it('should count by status', async () => {
      const claw1 = await repository.register({
        publicKey: 'key1',
        displayName: 'Active',
      })
      await repository.register({ publicKey: 'key2', displayName: 'Active 2' })
      await repository.deactivate(claw1.clawId)

      const activeCount = await repository.count({ status: 'active' })
      const deactivatedCount = await repository.count({ status: 'deactivated' })

      expect(activeCount).toBe(1)
      expect(deactivatedCount).toBe(1)
    })

    it('should count by discoverable', async () => {
      await repository.register({
        publicKey: 'key1',
        displayName: 'Discoverable',
        discoverable: true,
      })
      await repository.register({
        publicKey: 'key2',
        displayName: 'Not',
        discoverable: false,
      })

      const count = await repository.count({ discoverable: true })
      expect(count).toBe(1)
    })
  })
})
