/**
 * Realtime Integration Tests
 * 测试 WebSocketManager 与 IRealtimeService 的集成行为
 */

import { describe, it, expect } from 'vitest'
import { WebSocketRealtimeService } from '../../../src/realtime/websocket/websocket-realtime.service.js'
import { RealtimeFactory } from '../../../src/realtime/factory.js'
import type { IRealtimeService } from '../../../src/realtime/interfaces/realtime.interface.js'

describe('Realtime Service Integration', () => {
  describe('RealtimeFactory', () => {
    it('should create websocket realtime service', () => {
      const service = RealtimeFactory.create({ realtimeType: 'websocket' })
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(WebSocketRealtimeService)
    })

    it('should throw for redis-pubsub without clients', () => {
      expect(() =>
        RealtimeFactory.create({ realtimeType: 'redis-pubsub' })
      ).toThrow('Redis publisher and subscriber are required')
    })
  })

  describe('WebSocketRealtimeService as IRealtimeService', () => {
    let service: IRealtimeService

    it('should implement IRealtimeService interface', () => {
      service = new WebSocketRealtimeService()

      // Verify all interface methods exist
      expect(typeof service.sendToUser).toBe('function')
      expect(typeof service.sendToUsers).toBe('function')
      expect(typeof service.broadcast).toBe('function')
      expect(typeof service.subscribe).toBe('function')
      expect(typeof service.unsubscribe).toBe('function')
      expect(typeof service.publish).toBe('function')
      expect(typeof service.joinRoom).toBe('function')
      expect(typeof service.leaveRoom).toBe('function')
      expect(typeof service.getRoomUsers).toBe('function')
      expect(typeof service.getOnlineCount).toBe('function')
      expect(typeof service.ping).toBe('function')
    })

    it('should report healthy via ping', async () => {
      service = new WebSocketRealtimeService()
      expect(await service.ping()).toBe(true)
    })

    it('should start with zero online count', async () => {
      service = new WebSocketRealtimeService()
      expect(await service.getOnlineCount()).toBe(0)
    })

    it('should support publish/subscribe channels', async () => {
      service = new WebSocketRealtimeService()
      const received: any[] = []

      await service.subscribe('test-channel', (msg) => {
        received.push(msg)
      })

      await service.publish('test-channel', {
        type: 'test',
        payload: { hello: 'world' },
        timestamp: new Date().toISOString(),
      })

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('test')
      expect(received[0].payload.hello).toBe('world')
    })

    it('should unsubscribe from channels', async () => {
      service = new WebSocketRealtimeService()
      const received: any[] = []

      await service.subscribe('ch1', (msg) => received.push(msg))
      await service.publish('ch1', {
        type: 'before',
        payload: {},
        timestamp: new Date().toISOString(),
      })

      expect(received).toHaveLength(1)

      await service.unsubscribe('ch1')
      await service.publish('ch1', {
        type: 'after',
        payload: {},
        timestamp: new Date().toISOString(),
      })

      // Should not receive after unsubscribe
      expect(received).toHaveLength(1)
    })

    it('should handle sendToUser for non-connected user gracefully', async () => {
      service = new WebSocketRealtimeService()

      // Should not throw for non-connected user
      await expect(
        service.sendToUser('nonexistent', {
          type: 'test',
          payload: {},
          timestamp: new Date().toISOString(),
        })
      ).resolves.toBeUndefined()
    })

    it('should handle room operations for non-connected user', async () => {
      service = new WebSocketRealtimeService()

      // joinRoom should throw for non-connected user
      await expect(
        service.joinRoom('nonexistent', 'room1')
      ).rejects.toThrow('not connected')

      // leaveRoom should not throw
      await expect(
        service.leaveRoom('nonexistent', 'room1')
      ).resolves.toBeUndefined()

      // getRoomUsers should return empty
      const users = await service.getRoomUsers('room1')
      expect(users).toEqual([])
    })
  })

  describe('AppContext realtimeService', () => {
    it('should be available in AppContext', async () => {
      // Verify that createApp exposes realtimeService in context
      const { createApp } = await import('../../../src/app.js')
      const Database = (await import('better-sqlite3')).default
      const { createDatabase } = await import('../../../src/db/database.js')

      const db = createDatabase(':memory:')
      const { ctx } = createApp({
        repositoryOptions: {
          databaseType: 'sqlite',
          sqliteDb: db,
        },
      })

      expect(ctx.realtimeService).toBeDefined()
      expect(await ctx.realtimeService!.ping()).toBe(true)

      db.close()
    })

    it('should expose cacheService in AppContext', async () => {
      const { createApp } = await import('../../../src/app.js')
      const Database = (await import('better-sqlite3')).default
      const { createDatabase } = await import('../../../src/db/database.js')

      const db = createDatabase(':memory:')
      const { ctx } = createApp({
        repositoryOptions: {
          databaseType: 'sqlite',
          sqliteDb: db,
        },
      })

      expect(ctx.cacheService).toBeDefined()
      expect(await ctx.cacheService!.ping()).toBe(true)

      db.close()
    })
  })
})
