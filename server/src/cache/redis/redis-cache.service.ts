/**
 * Redis Cache Service
 * 基于 ioredis 的 Redis 缓存服务实现
 */

import type { Redis } from 'ioredis'
import type { ICacheService } from '../interfaces/cache.interface.js'

export class RedisCacheService implements ICacheService {
  constructor(private redis: Redis) {}

  // ========== 辅助方法 ==========

  /**
   * 序列化值
   */
  private serialize(value: any): string {
    return JSON.stringify(value)
  }

  /**
   * 反序列化值
   */
  private deserialize<T>(value: string | null): T | null {
    if (value === null) return null
    return JSON.parse(value)
  }

  // ========== 基础操作 ==========

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key)
    return this.deserialize<T>(value)
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = this.serialize(value)

    if (ttl) {
      await this.redis.setex(key, ttl, serialized)
    } else {
      await this.redis.set(key, serialized)
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key)
    return result === 1
  }

  // ========== 批量操作 ==========

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return []

    const values = await this.redis.mget(...keys)
    return values.map((value) => this.deserialize<T>(value))
  }

  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    // Redis 不支持批量设置带 TTL 的值，需要使用 pipeline
    const pipeline = this.redis.pipeline()

    for (const entry of entries) {
      const serialized = this.serialize(entry.value)

      if (entry.ttl) {
        pipeline.setex(entry.key, entry.ttl, serialized)
      } else {
        pipeline.set(entry.key, serialized)
      }
    }

    await pipeline.exec()
  }

  async mdel(keys: string[]): Promise<void> {
    if (keys.length === 0) return

    await this.redis.del(...keys)
  }

  // ========== 哈希操作 ==========

  async hget<T>(key: string, field: string): Promise<T | null> {
    const value = await this.redis.hget(key, field)
    return this.deserialize<T>(value)
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    const serialized = this.serialize(value)
    await this.redis.hset(key, field, serialized)
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redis.hdel(key, field)
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const hash = await this.redis.hgetall(key)
    const result: Record<string, T> = {}

    for (const [field, value] of Object.entries(hash)) {
      result[field] = this.deserialize<T>(value)!
    }

    return result
  }

  // ========== 集合操作 ==========

  async sadd<T>(key: string, ...members: T[]): Promise<void> {
    if (members.length === 0) return

    const serialized = members.map((m) => this.serialize(m))
    await this.redis.sadd(key, ...serialized)
  }

  async srem<T>(key: string, ...members: T[]): Promise<void> {
    if (members.length === 0) return

    const serialized = members.map((m) => this.serialize(m))
    await this.redis.srem(key, ...serialized)
  }

  async smembers<T>(key: string): Promise<T[]> {
    const members = await this.redis.smembers(key)
    return members.map((m) => this.deserialize<T>(m)!)
  }

  async sismember<T>(key: string, member: T): Promise<boolean> {
    const serialized = this.serialize(member)
    const result = await this.redis.sismember(key, serialized)
    return result === 1
  }

  // ========== 列表操作 ==========

  async lpush<T>(key: string, ...values: T[]): Promise<void> {
    if (values.length === 0) return

    const serialized = values.map((v) => this.serialize(v))
    await this.redis.lpush(key, ...serialized)
  }

  async rpush<T>(key: string, ...values: T[]): Promise<void> {
    if (values.length === 0) return

    const serialized = values.map((v) => this.serialize(v))
    await this.redis.rpush(key, ...serialized)
  }

  async lpop<T>(key: string): Promise<T | null> {
    const value = await this.redis.lpop(key)
    return this.deserialize<T>(value)
  }

  async rpop<T>(key: string): Promise<T | null> {
    const value = await this.redis.rpop(key)
    return this.deserialize<T>(value)
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const values = await this.redis.lrange(key, start, stop)
    return values.map((v) => this.deserialize<T>(v)!)
  }

  // ========== 管理操作 ==========

  async flush(): Promise<void> {
    await this.redis.flushdb()
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping()
      return result === 'PONG'
    } catch {
      return false
    }
  }

  /**
   * 获取 Redis 信息（扩展方法）
   */
  async getInfo(): Promise<string> {
    return this.redis.info()
  }

  /**
   * 获取数据库大小（扩展方法）
   */
  async dbSize(): Promise<number> {
    return this.redis.dbsize()
  }

  /**
   * 设置键的过期时间（扩展方法）
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds)
  }

  /**
   * 获取键的剩余生存时间（扩展方法）
   */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key)
  }
}
