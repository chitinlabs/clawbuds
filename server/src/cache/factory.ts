/**
 * Cache Factory
 * 根据配置创建不同的缓存服务实现
 */

import type { ICacheService } from './interfaces/cache.interface.js'
import type { Redis } from 'ioredis'

// Cache 实现
import { MemoryCacheService } from './memory/memory-cache.service.js'
import { RedisCacheService } from './redis/redis-cache.service.js'

export type CacheType = 'memory' | 'redis'

export interface CacheFactoryOptions {
  cacheType: CacheType
  redis?: Redis
  enabled?: boolean
}

/**
 * Cache 工厂类
 * 负责创建缓存服务实例
 */
export class CacheFactory {
  /**
   * 创建 Cache 服务实例
   */
  static create(options: CacheFactoryOptions): ICacheService {
    if (options.enabled === false) {
      // 返回一个空实现（NoOp）
      return createNoOpCache()
    }

    switch (options.cacheType) {
      case 'memory':
        return new MemoryCacheService()

      case 'redis':
        if (!options.redis) {
          throw new Error('Redis instance is required when cacheType is "redis"')
        }
        return new RedisCacheService(options.redis)

      default:
        throw new Error(`Unsupported cache type: ${options.cacheType}`)
    }
  }
}

/**
 * 创建一个 NoOp 缓存实现（禁用缓存时使用）
 */
function createNoOpCache(): ICacheService {
  return {
    async get() {
      return null
    },
    async set() {},
    async del() {},
    async exists() {
      return false
    },
    async mget() {
      return []
    },
    async mset() {},
    async mdel() {},
    async hget() {
      return null
    },
    async hset() {},
    async hdel() {},
    async hgetall() {
      return {}
    },
    async sadd() {},
    async srem() {},
    async smembers() {
      return []
    },
    async sismember() {
      return false
    },
    async lpush() {},
    async rpush() {},
    async lpop() {
      return null
    },
    async rpop() {
      return null
    },
    async lrange() {
      return []
    },
    async flush() {},
    async ping() {
      return true
    }
  }
}
