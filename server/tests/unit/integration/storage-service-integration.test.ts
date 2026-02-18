/**
 * Storage Integration Tests
 * 测试 UploadService 与 IStorageService 的集成行为
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from '../../../src/db/database.js'
import { SQLiteUploadRepository } from '../../../src/db/repositories/sqlite/upload.repository.js'
import { UploadService } from '../../../src/services/upload.service.js'
import { StorageFactory } from '../../../src/storage/factory.js'
import { LocalStorageService } from '../../../src/storage/local/local-storage.service.js'
import { generateKeyPair, generateClawId } from '@clawbuds/shared'

const TEST_DIR = join(process.cwd(), '.test-storage-integration')
const UPLOAD_DIR = join(TEST_DIR, 'uploads')
const STORAGE_DIR = join(TEST_DIR, 'storage')

function createTestClaw(db: Database.Database): string {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  db.prepare(
    `INSERT INTO claws (claw_id, public_key, display_name) VALUES (?, ?, ?)`
  ).run(clawId, keys.publicKey, 'TestUser')
  return clawId
}

describe('Storage Service Integration', () => {
  let db: Database.Database
  let uploadService: UploadService
  let testClawId: string

  beforeEach(() => {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    mkdirSync(STORAGE_DIR, { recursive: true })
    db = createDatabase(':memory:')
    testClawId = createTestClaw(db)
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('UploadService with IStorageService', () => {
    it('should accept optional storage service', () => {
      const repo = new SQLiteUploadRepository(db)
      const storageService = new LocalStorageService({
        rootDir: STORAGE_DIR,
        baseUrl: 'http://localhost:8765/storage',
      })
      uploadService = new UploadService(repo, UPLOAD_DIR, storageService)

      expect(uploadService.getStorageService()).toBe(storageService)
    })

    it('should work without storage service (backward compatible)', () => {
      const repo = new SQLiteUploadRepository(db)
      uploadService = new UploadService(repo, UPLOAD_DIR)

      expect(uploadService.getStorageService()).toBeUndefined()
      expect(uploadService.getUploadDir()).toBe(UPLOAD_DIR)
    })

    it('should report isRemoteStorage=false for LocalStorageService', () => {
      const repo = new SQLiteUploadRepository(db)
      const storageService = new LocalStorageService({
        rootDir: STORAGE_DIR,
        baseUrl: 'http://localhost:8765/storage',
      })
      uploadService = new UploadService(repo, UPLOAD_DIR, storageService)

      expect(uploadService.isRemoteStorage()).toBe(false)
    })

    it('should report isRemoteStorage=false when no storage service', () => {
      const repo = new SQLiteUploadRepository(db)
      uploadService = new UploadService(repo, UPLOAD_DIR)

      expect(uploadService.isRemoteStorage()).toBe(false)
    })

    it('should return null URL for local storage (not remote)', async () => {
      const repo = new SQLiteUploadRepository(db)
      const storageService = new LocalStorageService({
        rootDir: STORAGE_DIR,
        baseUrl: 'http://localhost:8765/storage',
      })
      uploadService = new UploadService(repo, UPLOAD_DIR, storageService)

      const upload = await uploadService.upload(
        testClawId,
        'test.jpg',
        'image/jpeg',
        1024,
        'test-file.jpg',
      )

      // Local storage is not remote, so getFileUrl returns null
      const url = await uploadService.getFileUrl(upload.id)
      expect(url).toBeNull()
    })

    it('should return null URL for non-existent upload', async () => {
      const repo = new SQLiteUploadRepository(db)
      const storageService = new LocalStorageService({
        rootDir: STORAGE_DIR,
        baseUrl: 'http://localhost:8765/storage',
      })
      uploadService = new UploadService(repo, UPLOAD_DIR, storageService)

      const url = await uploadService.getFileUrl('nonexistent-id')
      expect(url).toBeNull()
    })

    it('should return null URL without storage service', async () => {
      const repo = new SQLiteUploadRepository(db)
      uploadService = new UploadService(repo, UPLOAD_DIR)

      const upload = await uploadService.upload(
        testClawId,
        'test.jpg',
        'image/jpeg',
        1024,
        'test-file.jpg',
      )

      const url = await uploadService.getFileUrl(upload.id)
      expect(url).toBeNull()
    })

    it('should delete file through storage service', async () => {
      const repo = new SQLiteUploadRepository(db)
      const storageService = new LocalStorageService({
        rootDir: STORAGE_DIR,
        baseUrl: 'http://localhost:8765/storage',
      })
      uploadService = new UploadService(repo, UPLOAD_DIR, storageService)

      const upload = await uploadService.upload(
        testClawId,
        'test.jpg',
        'image/jpeg',
        1024,
        'test-file.jpg',
      )

      // deleteUpload should call storageService.delete() then repository.delete()
      await uploadService.deleteUpload(upload.id, testClawId)
      const found = await uploadService.findById(upload.id)
      expect(found).toBeNull()
    })
  })

  describe('StorageFactory', () => {
    it('should create local storage', () => {
      const storage = StorageFactory.create({
        storageType: 'local',
        localConfig: {
          baseDir: STORAGE_DIR,
          publicUrl: 'http://localhost:8765/storage',
        },
      })
      expect(storage).toBeDefined()
      expect(storage).toBeInstanceOf(LocalStorageService)
    })

    it('should throw for local storage without config', () => {
      expect(() =>
        StorageFactory.create({ storageType: 'local' })
      ).toThrow('Local storage config is required')
    })

    it('should throw for supabase storage without client', () => {
      expect(() =>
        StorageFactory.create({ storageType: 'supabase' })
      ).toThrow('Supabase client is required')
    })
  })
})
