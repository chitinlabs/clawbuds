/**
 * Redis Pub/Sub Realtime Service Integration Tests
 * 需要运行中的 Redis 实例 (localhost:6379)
 * 启动: docker compose up -d redis
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import Redis from 'ioredis'
import { RedisPubSubRealtimeService } from '../../../src/realtime/redis/redis-pubsub-realtime.service.js'
import { RealtimeFactory } from '../../../src/realtime/factory.js'
import type { RealtimeMessage } from '../../../src/realtime/interfaces/realtime.interface.js'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const TEST_PREFIX = 'test:rt:'

describe('RedisPubSubRealtimeService Integration', () => {
  let publisher: Redis
  let subscriber: Redis
  let service: RedisPubSubRealtimeService

  beforeAll(async () => {
    publisher = new Redis(REDIS_URL, { lazyConnect: true })
    subscriber = new Redis(REDIS_URL, { lazyConnect: true })
    try {
      await publisher.connect()
      await subscriber.connect()
    } catch {
      return
    }
    service = new RedisPubSubRealtimeService({
      publisher,
      subscriber,
      keyPrefix: TEST_PREFIX,
    })
  })

  beforeEach(async () => {
    if (!publisher || publisher.status !== 'ready') return
    // Clean test keys
    const keys = await publisher.keys(`${TEST_PREFIX}*`)
    if (keys.length > 0) {
      await publisher.del(...keys)
    }
  })

  afterAll(async () => {
    if (service) {
      try { await service.close() } catch { /* ignore */ }
    }
    if (publisher && publisher.status === 'ready') {
      const keys = await publisher.keys(`${TEST_PREFIX}*`)
      if (keys.length > 0) await publisher.del(...keys)
      await publisher.quit()
    }
  })

  describe('Health Check', () => {
    it('should ping successfully', async () => {
      if (!publisher || publisher.status !== 'ready') return
      const result = await service.ping()
      expect(result).toBe(true)
    })
  })

  describe('Pub/Sub Messaging', () => {
    it('should publish and receive messages on a channel', async () => {
      if (!publisher || publisher.status !== 'ready') return

      const received: RealtimeMessage[] = []

      await service.subscribe('test-channel', (msg) => {
        received.push(msg)
      })

      // Small delay for subscription to register
      await new Promise(r => setTimeout(r, 100))

      await service.publish('test-channel', {
        type: 'greeting',
        payload: { text: 'Hello Redis!' },
        timestamp: new Date().toISOString(),
      })

      // Wait for message delivery
      await new Promise(r => setTimeout(r, 200))

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('greeting')
      expect(received[0].payload.text).toBe('Hello Redis!')
    })

    it('should unsubscribe from channel', async () => {
      if (!publisher || publisher.status !== 'ready') return

      const received: RealtimeMessage[] = []

      await service.subscribe('unsub-channel', (msg) => {
        received.push(msg)
      })

      await new Promise(r => setTimeout(r, 100))

      await service.publish('unsub-channel', {
        type: 'before',
        payload: {},
        timestamp: new Date().toISOString(),
      })

      await new Promise(r => setTimeout(r, 200))
      expect(received).toHaveLength(1)

      await service.unsubscribe('unsub-channel')

      await service.publish('unsub-channel', {
        type: 'after',
        payload: {},
        timestamp: new Date().toISOString(),
      })

      await new Promise(r => setTimeout(r, 200))
      // Should still be 1 - message after unsubscribe not received
      expect(received).toHaveLength(1)
    })
  })

  describe('Room Management', () => {
    it('should join and leave rooms', async () => {
      if (!publisher || publisher.status !== 'ready') return

      await service.joinRoom('user1', 'room-a')
      await service.joinRoom('user2', 'room-a')

      const users = await service.getRoomUsers('room-a')
      expect(users.sort()).toEqual(['user1', 'user2'])

      await service.leaveRoom('user1', 'room-a')
      const usersAfter = await service.getRoomUsers('room-a')
      expect(usersAfter).toEqual(['user2'])
    })

    it('should return empty for non-existent room', async () => {
      if (!publisher || publisher.status !== 'ready') return

      const users = await service.getRoomUsers('ghost-room')
      expect(users).toEqual([])
    })
  })

  describe('Online Status', () => {
    it('should track user online status', async () => {
      if (!publisher || publisher.status !== 'ready') return

      await service.setUserOnline('online-user', 5) // 5 seconds
      expect(await service.isUserOnline('online-user')).toBe(true)

      await service.setUserOffline('online-user')
      expect(await service.isUserOnline('online-user')).toBe(false)
    })

    it('should count online users', async () => {
      if (!publisher || publisher.status !== 'ready') return

      await service.setUserOnline('u1', 60)
      await service.setUserOnline('u2', 60)
      const count = await service.getOnlineCount()
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })

  describe('User Messaging', () => {
    it('should send message to user channel', async () => {
      if (!publisher || publisher.status !== 'ready') return

      // sendToUser publishes to a user-specific channel
      // This is fire-and-forget since there might be no subscriber for that user
      await expect(
        service.sendToUser('target-user', {
          type: 'notification',
          payload: { text: 'New message!' },
          timestamp: new Date().toISOString(),
        })
      ).resolves.toBeUndefined()
    })

    it('should send to multiple users', async () => {
      if (!publisher || publisher.status !== 'ready') return

      await expect(
        service.sendToUsers(['u1', 'u2', 'u3'], {
          type: 'broadcast',
          payload: { text: 'Hello all!' },
          timestamp: new Date().toISOString(),
        })
      ).resolves.toBeUndefined()
    })

    it('should broadcast to room channel', async () => {
      if (!publisher || publisher.status !== 'ready') return

      await expect(
        service.broadcast('main-room', {
          type: 'room-msg',
          payload: { from: 'system', text: 'Welcome!' },
          timestamp: new Date().toISOString(),
        })
      ).resolves.toBeUndefined()
    })
  })

  describe('Stats', () => {
    it('should return stats', async () => {
      if (!publisher || publisher.status !== 'ready') return

      const stats = await service.getStats()
      expect(stats).toHaveProperty('onlineUsers')
      expect(stats).toHaveProperty('rooms')
      expect(stats).toHaveProperty('channels')
      expect(typeof stats.onlineUsers).toBe('number')
    })
  })
})

describe('RealtimeFactory with real Redis', () => {
  let publisher: Redis
  let subscriber: Redis

  beforeAll(async () => {
    publisher = new Redis(REDIS_URL, { lazyConnect: true })
    subscriber = new Redis(REDIS_URL, { lazyConnect: true })
    try {
      await publisher.connect()
      await subscriber.connect()
    } catch {
      return
    }
  })

  afterAll(async () => {
    if (publisher && publisher.status === 'ready') await publisher.quit()
    if (subscriber && subscriber.status === 'ready') await subscriber.quit()
  })

  it('should create RedisPubSubRealtimeService via factory', async () => {
    if (!publisher || publisher.status !== 'ready') return

    const service = RealtimeFactory.create({
      realtimeType: 'redis-pubsub',
      redisPublisher: publisher,
      redisSubscriber: subscriber,
      keyPrefix: 'test:factory:',
    })

    expect(service).toBeInstanceOf(RedisPubSubRealtimeService)
    expect(await service.ping()).toBe(true)
  })
})
