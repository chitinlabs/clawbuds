/**
 * Abstraction Layer Path Verification Tests
 *
 * 这些测试验证三层抽象 (Cache / Storage / Realtime) 确实在核心路径中被调用，
 * 而不是被绕过。使用 mock/spy 来追踪方法调用。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from '../../../src/db/database.js'
import { SQLiteClawRepository } from '../../../src/db/repositories/sqlite/claw.repository.js'
import { SQLiteUploadRepository } from '../../../src/db/repositories/sqlite/upload.repository.js'
import { ClawService } from '../../../src/services/claw.service.js'
import { UploadService } from '../../../src/services/upload.service.js'
import { MemoryCacheService } from '../../../src/cache/memory/memory-cache.service.js'
import { WebSocketRealtimeService } from '../../../src/realtime/websocket/websocket-realtime.service.js'
import type { ICacheService } from '../../../src/cache/interfaces/cache.interface.js'
import type { IStorageService, UploadResult, FileMetadata } from '../../../src/storage/interfaces/storage.interface.js'
import type { IRealtimeService, RealtimeMessage } from '../../../src/realtime/interfaces/realtime.interface.js'
import { generateKeyPair, generateClawId } from '../../../src/lib/sign-protocol.js'
import type { WebSocket } from 'ws'

const TEST_DIR = join(process.cwd(), '.test-path-verification')
const UPLOAD_DIR = join(TEST_DIR, 'uploads')

// ========== Mock Implementations ==========

/**
 * Mock remote storage service (simulates Supabase Storage)
 * Class name is NOT "LocalStorageService" so isRemoteStorage() returns true
 */
class MockRemoteStorageService implements IStorageService {
  uploadCalls: Array<{ bucket: string; path: string }> = []
  deleteCalls: Array<{ bucket: string; path: string }> = []

  async upload(bucket: string, path: string, _file: Buffer | NodeJS.ReadableStream): Promise<UploadResult> {
    this.uploadCalls.push({ bucket, path })
    return { url: `https://storage.example.com/${bucket}/${path}`, path, size: 100, contentType: 'image/jpeg' }
  }
  async uploadMany(): Promise<UploadResult[]> { return [] }
  async download(): Promise<Buffer> { return Buffer.from('test') }
  getPublicUrl(bucket: string, path: string): string { return `https://storage.example.com/${bucket}/${path}` }
  async getSignedUrl(): Promise<string> { return 'https://signed.url' }
  async delete(bucket: string, path: string): Promise<void> { this.deleteCalls.push({ bucket, path }) }
  async deleteMany(): Promise<void> {}
  async list(): Promise<FileMetadata[]> { return [] }
  async exists(): Promise<boolean> { return true }
  async getMetadata(): Promise<FileMetadata> { return { path: '', size: 0, lastModified: new Date() } }
  async copy(): Promise<void> {}
  async move(): Promise<void> {}
}

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  readyState = 1 // WebSocket.OPEN
  messages: string[] = []
  send(data: string): void { this.messages.push(data) }
  close(): void { this.readyState = 3; this.emit('close') }
  ping(): void {}
}

// ========== Helper ==========

function createTestClaw(db: Database.Database): { clawId: string; publicKey: string } {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  db.prepare('INSERT INTO claws (claw_id, public_key, display_name) VALUES (?, ?, ?)').run(clawId, keys.publicKey, 'TestUser')
  return { clawId, publicKey: keys.publicKey }
}

// ========== Tests ==========

describe('Abstraction Layer Path Verification', () => {
  let db: Database.Database

  beforeEach(() => {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    db = createDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('Cache Layer: ClawService → ICacheService', () => {
    it('should call cache.get on findById (cache miss → DB → cache.set)', async () => {
      const cache = new MemoryCacheService()
      const getSpy = vi.spyOn(cache, 'get')
      const setSpy = vi.spyOn(cache, 'set')

      const repo = new SQLiteClawRepository(db)
      const service = new ClawService(repo, cache)

      const { clawId } = createTestClaw(db)

      // First call: cache miss → reads from DB → sets cache
      const result = await service.findById(clawId)
      expect(result).not.toBeNull()
      expect(getSpy).toHaveBeenCalledWith(`claw:${clawId}`)
      expect(setSpy).toHaveBeenCalledWith(`claw:${clawId}`, expect.any(Object), expect.any(Number))
    })

    it('should return cached value on second findById (cache hit)', async () => {
      const cache = new MemoryCacheService()
      const repo = new SQLiteClawRepository(db)
      const service = new ClawService(repo, cache)

      const { clawId } = createTestClaw(db)

      // First call: populates cache
      await service.findById(clawId)

      // Spy after first call
      const repoSpy = vi.spyOn(repo, 'findById')

      // Second call: should hit cache, NOT call repository
      const result2 = await service.findById(clawId)
      expect(result2).not.toBeNull()
      expect(repoSpy).not.toHaveBeenCalled()
    })

    it('should call cache.del on updateProfile (cache invalidation)', async () => {
      const cache = new MemoryCacheService()
      const delSpy = vi.spyOn(cache, 'del')

      const repo = new SQLiteClawRepository(db)
      const service = new ClawService(repo, cache)

      const { clawId } = createTestClaw(db)

      // Populate cache
      await service.findById(clawId)
      expect(await cache.exists(`claw:${clawId}`)).toBe(true)

      // Update triggers cache invalidation
      await service.updateProfile(clawId, { displayName: 'Updated' })
      expect(delSpy).toHaveBeenCalledWith(`claw:${clawId}`)
      expect(await cache.exists(`claw:${clawId}`)).toBe(false)
    })
  })

  describe('Storage Layer: UploadService → IStorageService', () => {
    it('should call storageService.upload() for remote storage on upload()', async () => {
      const mockStorage = new MockRemoteStorageService()
      const repo = new SQLiteUploadRepository(db)
      const { clawId } = createTestClaw(db)
      const service = new UploadService(repo, UPLOAD_DIR, mockStorage)

      // Create a fake file on disk (simulating multer output)
      const filename = 'test-remote-upload.jpg'
      writeFileSync(join(UPLOAD_DIR, filename), Buffer.from('fake image content'))

      await service.upload(clawId, 'photo.jpg', 'image/jpeg', 18, filename)

      // Verify IStorageService.upload() was called
      expect(mockStorage.uploadCalls).toHaveLength(1)
      expect(mockStorage.uploadCalls[0]).toEqual({ bucket: 'uploads', path: filename })
    })

    it('should NOT call storageService.upload() for local storage on upload()', async () => {
      const { LocalStorageService } = await import('../../../src/storage/local/local-storage.service.js')
      const localStorage = new LocalStorageService({ rootDir: TEST_DIR, baseUrl: 'http://localhost' })
      const uploadSpy = vi.spyOn(localStorage, 'upload')

      const repo = new SQLiteUploadRepository(db)
      const { clawId } = createTestClaw(db)
      const service = new UploadService(repo, UPLOAD_DIR, localStorage)

      // isRemoteStorage() returns false for LocalStorageService → upload() is NOT called
      await service.upload(clawId, 'photo.jpg', 'image/jpeg', 1024, 'test-local.jpg')
      expect(uploadSpy).not.toHaveBeenCalled()
    })

    it('should call storageService.delete() on deleteUpload()', async () => {
      const mockStorage = new MockRemoteStorageService()
      const repo = new SQLiteUploadRepository(db)
      const { clawId } = createTestClaw(db)
      const service = new UploadService(repo, UPLOAD_DIR, mockStorage)

      // Create a fake file for upload
      const filename = 'test-delete.jpg'
      writeFileSync(join(UPLOAD_DIR, filename), Buffer.from('fake'))

      const upload = await service.upload(clawId, 'photo.jpg', 'image/jpeg', 5, filename)

      await service.deleteUpload(upload.id, clawId)

      // Verify IStorageService.delete() was called
      expect(mockStorage.deleteCalls).toHaveLength(1)
      expect(mockStorage.deleteCalls[0]).toEqual({ bucket: 'uploads', path: filename })
    })

    it('should return storage URL for remote getFileUrl()', async () => {
      const mockStorage = new MockRemoteStorageService()
      const repo = new SQLiteUploadRepository(db)
      const { clawId } = createTestClaw(db)
      const service = new UploadService(repo, UPLOAD_DIR, mockStorage)

      const filename = 'test-url.jpg'
      writeFileSync(join(UPLOAD_DIR, filename), Buffer.from('fake'))

      const upload = await service.upload(clawId, 'photo.jpg', 'image/jpeg', 5, filename)
      const url = await service.getFileUrl(upload.id)

      expect(url).toBe(`https://storage.example.com/uploads/${filename}`)
    })
  })

  describe('Realtime Layer: WebSocketManager → IRealtimeService', () => {
    it('should route sendToUser through IRealtimeService (WebSocket mode)', async () => {
      const realtimeService = new WebSocketRealtimeService()
      const sendSpy = vi.spyOn(realtimeService, 'sendToUser')

      // Register a mock WebSocket
      const mockWs = new MockWebSocket()
      realtimeService.registerConnection('user-1', mockWs as unknown as WebSocket)

      // Directly test the realtimeService path
      const message: RealtimeMessage = {
        type: 'message.new',
        payload: { type: 'message.new', data: { text: 'hello' }, seq: 1 },
        timestamp: new Date().toISOString(),
      }

      await realtimeService.sendToUser('user-1', message)

      expect(sendSpy).toHaveBeenCalledWith('user-1', message)
      expect(mockWs.messages).toHaveLength(1)

      // Verify wire format: sends message.payload, not the full envelope
      const wireData = JSON.parse(mockWs.messages[0])
      expect(wireData).toEqual(message.payload)
      expect(wireData.type).toBe('message.new')
      expect(wireData.data.text).toBe('hello')
    })

    it('should deliver payload to all recipients via IRealtimeService', async () => {
      const realtimeService = new WebSocketRealtimeService()

      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()
      realtimeService.registerConnection('user-1', ws1 as unknown as WebSocket)
      realtimeService.registerConnection('user-2', ws2 as unknown as WebSocket)

      const message: RealtimeMessage = {
        type: 'friend.request',
        payload: { type: 'friend.request', data: { from: 'user-1' } },
        timestamp: new Date().toISOString(),
      }

      await realtimeService.sendToUsers(['user-1', 'user-2'], message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(1)
      expect(JSON.parse(ws1.messages[0])).toEqual(message.payload)
      expect(JSON.parse(ws2.messages[0])).toEqual(message.payload)
    })

    it('should support pub/sub for cross-node messaging', async () => {
      const realtimeService = new WebSocketRealtimeService()
      const received: RealtimeMessage[] = []

      // Subscribe to a user channel (simulates Redis PubSub subscriber)
      await realtimeService.subscribe('user:claw_123', (msg: RealtimeMessage) => {
        received.push(msg)
      })

      // Publish to the same channel (simulates another node sending)
      const message: RealtimeMessage = {
        type: 'message.new',
        payload: { type: 'message.new', data: { text: 'cross-node' } },
        timestamp: new Date().toISOString(),
      }
      await realtimeService.publish('user:claw_123', message)

      expect(received).toHaveLength(1)
      expect(received[0].payload.data.text).toBe('cross-node')
    })
  })

  describe('AppContext exposes all three services', () => {
    it('should initialize cache, storage, and realtime in AppContext', async () => {
      const { createApp } = await import('../../../src/app.js')
      const { createDatabase: createDb } = await import('../../../src/db/database.js')

      const testDb = createDb(':memory:')
      const { ctx } = createApp({
        repositoryOptions: { databaseType: 'sqlite', sqliteDb: testDb },
      })

      expect(ctx.cacheService).toBeDefined()
      expect(ctx.storageService).toBeDefined()
      expect(ctx.realtimeService).toBeDefined()

      // All should be healthy
      expect(await ctx.cacheService!.ping()).toBe(true)
      expect(await ctx.realtimeService!.ping()).toBe(true)

      testDb.close()
    })
  })
})
