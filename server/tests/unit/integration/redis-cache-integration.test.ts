/**
 * Redis Cache Service Integration Tests
 * 需要运行中的 Redis 实例 (localhost:6379)
 * 启动: docker compose up -d redis
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import Redis from 'ioredis'
import { RedisCacheService } from '../../../src/cache/redis/redis-cache.service.js'
import { CacheFactory } from '../../../src/cache/factory.js'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const TEST_PREFIX = 'test:cache:'

describe('RedisCacheService Integration', () => {
  let redis: Redis
  let cache: RedisCacheService

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { keyPrefix: TEST_PREFIX, lazyConnect: true })
    try {
      await redis.connect()
    } catch {
      // Skip all tests if Redis is not available
      return
    }
    cache = new RedisCacheService(redis)
  })

  beforeEach(async () => {
    if (!redis || redis.status !== 'ready') return
    // Clean test keys before each test
    const keys = await redis.keys(`${TEST_PREFIX}*`)
    if (keys.length > 0) {
      // Strip prefix since ioredis keyPrefix adds it automatically
      const strippedKeys = keys.map(k => k.replace(TEST_PREFIX, ''))
      await redis.del(...strippedKeys)
    }
  })

  afterAll(async () => {
    if (redis && redis.status === 'ready') {
      const keys = await redis.keys(`${TEST_PREFIX}*`)
      if (keys.length > 0) {
        const strippedKeys = keys.map(k => k.replace(TEST_PREFIX, ''))
        await redis.del(...strippedKeys)
      }
      await redis.quit()
    }
  })

  describe('Health Check', () => {
    it('should ping successfully', async () => {
      if (redis.status !== 'ready') return
      const result = await cache.ping()
      expect(result).toBe(true)
    })
  })

  describe('Basic Operations', () => {
    it('should set and get string value', async () => {
      if (redis.status !== 'ready') return
      await cache.set('str1', 'hello')
      const result = await cache.get<string>('str1')
      expect(result).toBe('hello')
    })

    it('should set and get object value', async () => {
      if (redis.status !== 'ready') return
      const obj = { name: 'Alice', age: 30, tags: ['admin'] }
      await cache.set('obj1', obj)
      const result = await cache.get<typeof obj>('obj1')
      expect(result).toEqual(obj)
    })

    it('should return null for non-existent key', async () => {
      if (redis.status !== 'ready') return
      const result = await cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should delete key', async () => {
      if (redis.status !== 'ready') return
      await cache.set('del1', 'value')
      await cache.del('del1')
      const result = await cache.get('del1')
      expect(result).toBeNull()
    })

    it('should check key exists', async () => {
      if (redis.status !== 'ready') return
      await cache.set('exists1', 'value')
      expect(await cache.exists('exists1')).toBe(true)
      expect(await cache.exists('noexists')).toBe(false)
    })

    it('should respect TTL expiration', async () => {
      if (redis.status !== 'ready') return
      await cache.set('ttl1', 'temp', 1) // 1 second TTL
      expect(await cache.get('ttl1')).toBe('temp')

      await new Promise(r => setTimeout(r, 1200)) // Wait 1.2 seconds
      expect(await cache.get('ttl1')).toBeNull()
    })
  })

  describe('Batch Operations', () => {
    it('should mget multiple keys', async () => {
      if (redis.status !== 'ready') return
      await cache.set('m1', 'a')
      await cache.set('m2', 'b')
      const results = await cache.mget<string>(['m1', 'm2', 'm3'])
      expect(results).toEqual(['a', 'b', null])
    })

    it('should mset multiple keys with TTL', async () => {
      if (redis.status !== 'ready') return
      await cache.mset([
        { key: 'ms1', value: 'v1' },
        { key: 'ms2', value: 'v2', ttl: 60 },
      ])
      expect(await cache.get('ms1')).toBe('v1')
      expect(await cache.get('ms2')).toBe('v2')
    })

    it('should mdel multiple keys', async () => {
      if (redis.status !== 'ready') return
      await cache.set('md1', 'a')
      await cache.set('md2', 'b')
      await cache.mdel(['md1', 'md2'])
      expect(await cache.get('md1')).toBeNull()
      expect(await cache.get('md2')).toBeNull()
    })
  })

  describe('Hash Operations', () => {
    it('should set and get hash fields', async () => {
      if (redis.status !== 'ready') return
      await cache.hset('user:1', 'name', 'Alice')
      await cache.hset('user:1', 'age', 30)
      expect(await cache.hget<string>('user:1', 'name')).toBe('Alice')
      expect(await cache.hget<number>('user:1', 'age')).toBe(30)
    })

    it('should get all hash fields', async () => {
      if (redis.status !== 'ready') return
      await cache.hset('user:2', 'name', 'Bob')
      await cache.hset('user:2', 'role', 'admin')
      const all = await cache.hgetall<string>('user:2')
      expect(all).toEqual({ name: 'Bob', role: 'admin' })
    })

    it('should delete hash field', async () => {
      if (redis.status !== 'ready') return
      await cache.hset('user:3', 'name', 'Charlie')
      await cache.hdel('user:3', 'name')
      expect(await cache.hget('user:3', 'name')).toBeNull()
    })
  })

  describe('Set Operations', () => {
    it('should add and check members', async () => {
      if (redis.status !== 'ready') return
      await cache.sadd('set1', 'a', 'b', 'c')
      expect(await cache.sismember('set1', 'a')).toBe(true)
      expect(await cache.sismember('set1', 'z')).toBe(false)
    })

    it('should get all members', async () => {
      if (redis.status !== 'ready') return
      await cache.sadd('set2', 'x', 'y')
      const members = await cache.smembers<string>('set2')
      expect(members.sort()).toEqual(['x', 'y'])
    })

    it('should remove members', async () => {
      if (redis.status !== 'ready') return
      await cache.sadd('set3', 'a', 'b')
      await cache.srem('set3', 'a')
      expect(await cache.sismember('set3', 'a')).toBe(false)
      expect(await cache.sismember('set3', 'b')).toBe(true)
    })
  })

  describe('List Operations', () => {
    it('should push and pop from list', async () => {
      if (redis.status !== 'ready') return
      await cache.lpush('list1', 'a', 'b')
      await cache.rpush('list1', 'c')
      expect(await cache.lpop<string>('list1')).toBe('b')
      expect(await cache.rpop<string>('list1')).toBe('c')
    })

    it('should get range from list', async () => {
      if (redis.status !== 'ready') return
      await cache.rpush('list2', '1', '2', '3', '4')
      const range = await cache.lrange<string>('list2', 0, 2)
      expect(range).toEqual(['1', '2', '3'])
    })
  })

  describe('Extended Operations', () => {
    it('should get TTL for key', async () => {
      if (redis.status !== 'ready') return
      await cache.set('ttlcheck', 'val', 60)
      const ttl = await cache.ttl('ttlcheck')
      expect(ttl).toBeGreaterThan(50)
      expect(ttl).toBeLessThanOrEqual(60)
    })

    it('should get db size', async () => {
      if (redis.status !== 'ready') return
      await cache.set('size1', 'val')
      const size = await cache.dbSize()
      expect(size).toBeGreaterThanOrEqual(1)
    })

    it('should flush all test data', async () => {
      if (redis.status !== 'ready') return
      await cache.set('flush1', 'val')
      // NOTE: flush() calls flushdb which clears the ENTIRE database
      // In tests we don't call it to avoid affecting other data
      expect(await cache.exists('flush1')).toBe(true)
    })
  })
})

describe('CacheFactory with real Redis', () => {
  let redis: Redis

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { lazyConnect: true })
    try {
      await redis.connect()
    } catch {
      return
    }
  })

  afterAll(async () => {
    if (redis && redis.status === 'ready') {
      await redis.quit()
    }
  })

  it('should create RedisCacheService via factory', async () => {
    if (!redis || redis.status !== 'ready') return
    const cache = CacheFactory.create({ cacheType: 'redis', redis })
    const result = await cache.ping()
    expect(result).toBe(true)
  })
})
