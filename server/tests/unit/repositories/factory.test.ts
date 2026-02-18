/**
 * RepositoryFactory unit tests for new repositories
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../src/db/database.js'
import { RepositoryFactory } from '../../../src/db/repositories/factory.js'
import type { IFriendModelRepository } from '../../../src/db/repositories/interfaces/friend-model.repository.interface.js'

describe('RepositoryFactory', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  describe('createFriendModelRepository', () => {
    it('should return an IFriendModelRepository instance for SQLite', () => {
      const factory = new RepositoryFactory({ databaseType: 'sqlite', sqliteDb: db })
      const repo = factory.createFriendModelRepository()
      expect(repo).toBeDefined()
      expect(typeof repo.get).toBe('function')
      expect(typeof repo.getAll).toBe('function')
      expect(typeof repo.create).toBe('function')
      expect(typeof repo.updateFromHeartbeat).toBe('function')
      expect(typeof repo.touchInteraction).toBe('function')
      expect(typeof repo.updateLayer1Fields).toBe('function')
      expect(typeof repo.delete).toBe('function')
    })

    it('should throw when databaseType is unsupported', () => {
      const factory = new RepositoryFactory({ databaseType: 'sqlite', sqliteDb: db })
      // Force unsupported type for testing
      ;(factory as any).databaseType = 'unsupported'
      expect(() => factory.createFriendModelRepository()).toThrow()
    })
  })
})
