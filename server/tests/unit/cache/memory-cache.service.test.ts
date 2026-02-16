/**
 * Memory Cache Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryCacheService } from '../../../src/cache/memory/memory-cache.service.js'

describe('MemoryCacheService', () => {
  let cache: MemoryCacheService

  beforeEach(() => {
    cache = new MemoryCacheService()
  })

  afterEach(async () => {
    await cache.flush()
  })

  describe('Basic Operations', () => {
    describe('get/set', () => {
      it('should set and get value', async () => {
        await cache.set('key1', 'value1')
        const value = await cache.get('key1')
        expect(value).toBe('value1')
      })

      it('should return null for non-existent key', async () => {
        const value = await cache.get('non-existent')
        expect(value).toBeNull()
      })

      it('should store different types of values', async () => {
        await cache.set('string', 'hello')
        await cache.set('number', 123)
        await cache.set('boolean', true)
        await cache.set('object', { a: 1, b: 2 })
        await cache.set('array', [1, 2, 3])

        expect(await cache.get('string')).toBe('hello')
        expect(await cache.get('number')).toBe(123)
        expect(await cache.get('boolean')).toBe(true)
        expect(await cache.get('object')).toEqual({ a: 1, b: 2 })
        expect(await cache.get('array')).toEqual([1, 2, 3])
      })

      it('should overwrite existing value', async () => {
        await cache.set('key', 'old')
        await cache.set('key', 'new')
        const value = await cache.get('key')
        expect(value).toBe('new')
      })
    })

    describe('del', () => {
      it('should delete existing key', async () => {
        await cache.set('key', 'value')
        await cache.del('key')
        const value = await cache.get('key')
        expect(value).toBeNull()
      })

      it('should not throw error for non-existent key', async () => {
        await expect(cache.del('non-existent')).resolves.not.toThrow()
      })
    })

    describe('exists', () => {
      it('should return true for existing key', async () => {
        await cache.set('key', 'value')
        const exists = await cache.exists('key')
        expect(exists).toBe(true)
      })

      it('should return false for non-existent key', async () => {
        const exists = await cache.exists('non-existent')
        expect(exists).toBe(false)
      })
    })
  })

  describe('TTL (Time To Live)', () => {
    it('should expire key after TTL', async () => {
      await cache.set('key', 'value', 1) // 1 second

      // Should exist immediately
      expect(await cache.get('key')).toBe('value')

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Should be expired
      expect(await cache.get('key')).toBeNull()
    })

    it('should not expire key without TTL', async () => {
      await cache.set('key', 'value')

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(await cache.get('key')).toBe('value')
    })

    it('should reset TTL on update', async () => {
      await cache.set('key', 'value1', 1)

      await new Promise((resolve) => setTimeout(resolve, 500))

      // Update with new TTL
      await cache.set('key', 'value2', 2)

      await new Promise((resolve) => setTimeout(resolve, 700))

      // Should still exist (old TTL was reset)
      expect(await cache.get('key')).toBe('value2')
    })

    it('should return false for expired key in exists()', async () => {
      await cache.set('key', 'value', 1)

      await new Promise((resolve) => setTimeout(resolve, 1100))

      expect(await cache.exists('key')).toBe(false)
    })

    it('should clean up timer on delete', async () => {
      await cache.set('key', 'value', 10)
      await cache.del('key')

      // Verify stats show no keys
      const stats = cache.getStats()
      expect(stats.keys).toBe(0)
    })
  })

  describe('Batch Operations', () => {
    describe('mget', () => {
      it('should get multiple values', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')
        await cache.set('key3', 'value3')

        const values = await cache.mget(['key1', 'key2', 'key3'])
        expect(values).toEqual(['value1', 'value2', 'value3'])
      })

      it('should return null for non-existent keys', async () => {
        await cache.set('key1', 'value1')

        const values = await cache.mget(['key1', 'key2', 'key3'])
        expect(values).toEqual(['value1', null, null])
      })

      it('should return empty array for empty input', async () => {
        const values = await cache.mget([])
        expect(values).toEqual([])
      })
    })

    describe('mset', () => {
      it('should set multiple values', async () => {
        await cache.mset([
          { key: 'key1', value: 'value1' },
          { key: 'key2', value: 'value2' },
          { key: 'key3', value: 'value3' },
        ])

        expect(await cache.get('key1')).toBe('value1')
        expect(await cache.get('key2')).toBe('value2')
        expect(await cache.get('key3')).toBe('value3')
      })

      it('should set values with TTL', async () => {
        await cache.mset([
          { key: 'key1', value: 'value1', ttl: 1 },
          { key: 'key2', value: 'value2', ttl: 2 },
        ])

        await new Promise((resolve) => setTimeout(resolve, 1100))

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBe('value2')
      })
    })

    describe('mdel', () => {
      it('should delete multiple keys', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')
        await cache.set('key3', 'value3')

        await cache.mdel(['key1', 'key3'])

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBe('value2')
        expect(await cache.get('key3')).toBeNull()
      })
    })
  })

  describe('Hash Operations', () => {
    describe('hget/hset', () => {
      it('should set and get hash field', async () => {
        await cache.hset('user:1', 'name', 'Alice')
        const name = await cache.hget('user:1', 'name')
        expect(name).toBe('Alice')
      })

      it('should set multiple fields', async () => {
        await cache.hset('user:1', 'name', 'Alice')
        await cache.hset('user:1', 'age', 30)
        await cache.hset('user:1', 'email', 'alice@example.com')

        expect(await cache.hget('user:1', 'name')).toBe('Alice')
        expect(await cache.hget('user:1', 'age')).toBe(30)
        expect(await cache.hget('user:1', 'email')).toBe('alice@example.com')
      })

      it('should return null for non-existent field', async () => {
        await cache.hset('user:1', 'name', 'Alice')
        const value = await cache.hget('user:1', 'age')
        expect(value).toBeNull()
      })

      it('should return null for non-existent hash', async () => {
        const value = await cache.hget('user:999', 'name')
        expect(value).toBeNull()
      })
    })

    describe('hdel', () => {
      it('should delete hash field', async () => {
        await cache.hset('user:1', 'name', 'Alice')
        await cache.hset('user:1', 'age', 30)

        await cache.hdel('user:1', 'age')

        expect(await cache.hget('user:1', 'name')).toBe('Alice')
        expect(await cache.hget('user:1', 'age')).toBeNull()
      })

      it('should not throw error for non-existent field', async () => {
        await expect(cache.hdel('user:1', 'age')).resolves.not.toThrow()
      })
    })

    describe('hgetall', () => {
      it('should get all hash fields', async () => {
        await cache.hset('user:1', 'name', 'Alice')
        await cache.hset('user:1', 'age', 30)
        await cache.hset('user:1', 'email', 'alice@example.com')

        const hash = await cache.hgetall('user:1')
        expect(hash).toEqual({
          name: 'Alice',
          age: 30,
          email: 'alice@example.com',
        })
      })

      it('should return empty object for non-existent hash', async () => {
        const hash = await cache.hgetall('user:999')
        expect(hash).toEqual({})
      })
    })
  })

  describe('Set Operations', () => {
    describe('sadd/smembers', () => {
      it('should add members to set', async () => {
        await cache.sadd('tags', 'red', 'green', 'blue')
        const members = await cache.smembers('tags')
        expect(members).toHaveLength(3)
        expect(members).toContain('red')
        expect(members).toContain('green')
        expect(members).toContain('blue')
      })

      it('should not add duplicate members', async () => {
        await cache.sadd('tags', 'red', 'green')
        await cache.sadd('tags', 'red', 'blue')

        const members = await cache.smembers('tags')
        expect(members).toHaveLength(3)
        expect(members.filter((m) => m === 'red')).toHaveLength(1)
      })

      it('should return empty array for non-existent set', async () => {
        const members = await cache.smembers('non-existent')
        expect(members).toEqual([])
      })
    })

    describe('srem', () => {
      it('should remove members from set', async () => {
        await cache.sadd('tags', 'red', 'green', 'blue')
        await cache.srem('tags', 'green')

        const members = await cache.smembers('tags')
        expect(members).toHaveLength(2)
        expect(members).not.toContain('green')
      })

      it('should remove multiple members', async () => {
        await cache.sadd('tags', 'red', 'green', 'blue', 'yellow')
        await cache.srem('tags', 'green', 'yellow')

        const members = await cache.smembers('tags')
        expect(members).toHaveLength(2)
        expect(members).toContain('red')
        expect(members).toContain('blue')
      })
    })

    describe('sismember', () => {
      it('should check if member exists in set', async () => {
        await cache.sadd('tags', 'red', 'green', 'blue')

        expect(await cache.sismember('tags', 'red')).toBe(true)
        expect(await cache.sismember('tags', 'yellow')).toBe(false)
      })

      it('should return false for non-existent set', async () => {
        expect(await cache.sismember('non-existent', 'value')).toBe(false)
      })
    })
  })

  describe('List Operations', () => {
    describe('lpush/rpush', () => {
      it('should push to left', async () => {
        await cache.lpush('queue', 'a')
        await cache.lpush('queue', 'b', 'c')

        const list = await cache.lrange('queue', 0, -1)
        expect(list).toEqual(['c', 'b', 'a'])
      })

      it('should push to right', async () => {
        await cache.rpush('queue', 'a')
        await cache.rpush('queue', 'b', 'c')

        const list = await cache.lrange('queue', 0, -1)
        expect(list).toEqual(['a', 'b', 'c'])
      })

      it('should support mixed push operations', async () => {
        await cache.rpush('queue', 'a', 'b')
        await cache.lpush('queue', 'x', 'y')

        const list = await cache.lrange('queue', 0, -1)
        expect(list).toEqual(['y', 'x', 'a', 'b'])
      })
    })

    describe('lpop/rpop', () => {
      it('should pop from left', async () => {
        await cache.rpush('queue', 'a', 'b', 'c')

        const value = await cache.lpop('queue')
        expect(value).toBe('a')

        const list = await cache.lrange('queue', 0, -1)
        expect(list).toEqual(['b', 'c'])
      })

      it('should pop from right', async () => {
        await cache.rpush('queue', 'a', 'b', 'c')

        const value = await cache.rpop('queue')
        expect(value).toBe('c')

        const list = await cache.lrange('queue', 0, -1)
        expect(list).toEqual(['a', 'b'])
      })

      it('should return null for empty list', async () => {
        expect(await cache.lpop('empty')).toBeNull()
        expect(await cache.rpop('empty')).toBeNull()
      })
    })

    describe('lrange', () => {
      it('should return range of elements', async () => {
        await cache.rpush('queue', 'a', 'b', 'c', 'd', 'e')

        expect(await cache.lrange('queue', 0, 2)).toEqual(['a', 'b', 'c'])
        expect(await cache.lrange('queue', 2, 4)).toEqual(['c', 'd', 'e'])
      })

      it('should support negative indices', async () => {
        await cache.rpush('queue', 'a', 'b', 'c', 'd', 'e')

        expect(await cache.lrange('queue', 0, -1)).toEqual(['a', 'b', 'c', 'd', 'e'])
        expect(await cache.lrange('queue', -3, -1)).toEqual(['c', 'd', 'e'])
      })

      it('should return empty array for non-existent list', async () => {
        expect(await cache.lrange('empty', 0, -1)).toEqual([])
      })
    })
  })

  describe('Management Operations', () => {
    describe('flush', () => {
      it('should clear all data', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')
        await cache.sadd('set', 'a', 'b')

        await cache.flush()

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBeNull()
        expect(await cache.smembers('set')).toEqual([])
      })

      it('should clear all timers', async () => {
        await cache.set('key1', 'value1', 10)
        await cache.set('key2', 'value2', 20)

        await cache.flush()

        const stats = cache.getStats()
        expect(stats.keys).toBe(0)
      })
    })

    describe('ping', () => {
      it('should return true', async () => {
        const result = await cache.ping()
        expect(result).toBe(true)
      })
    })

    describe('getStats', () => {
      it('should return cache statistics', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', { data: 'value2' })

        const stats = cache.getStats()
        expect(stats.keys).toBe(2)
        expect(stats.memoryUsage).toBeGreaterThan(0)
      })

      it('should return zero stats for empty cache', () => {
        const stats = cache.getStats()
        expect(stats.keys).toBe(0)
        expect(stats.memoryUsage).toBe(0)
      })
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle concurrent operations', async () => {
      const operations = []

      for (let i = 0; i < 100; i++) {
        operations.push(cache.set(`key${i}`, `value${i}`))
      }

      await Promise.all(operations)

      const stats = cache.getStats()
      expect(stats.keys).toBe(100)
    })

    it('should preserve data types', async () => {
      const testData = {
        string: 'hello',
        number: 123,
        boolean: true,
        null: null,
        object: { nested: { deep: 'value' } },
        array: [1, 'two', { three: 3 }],
      }

      await cache.set('data', testData)
      const retrieved = await cache.get('data')

      expect(retrieved).toEqual(testData)
    })

    it('should handle large values', async () => {
      const largeString = 'x'.repeat(10000)
      await cache.set('large', largeString)

      const retrieved = await cache.get('large')
      expect(retrieved).toBe(largeString)
    })
  })
})
