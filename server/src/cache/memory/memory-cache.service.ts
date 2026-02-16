/**
 * Memory Cache Service
 * 基于内存的缓存服务实现
 */

import type { ICacheService } from '../interfaces/cache.interface.js'

interface CacheEntry {
  value: any
  expiresAt?: number
}

export class MemoryCacheService implements ICacheService {
  private cache: Map<string, CacheEntry>
  private timers: Map<string, NodeJS.Timeout>

  constructor() {
    this.cache = new Map()
    this.timers = new Map()
  }

  // ========== 辅助方法 ==========

  /**
   * 检查并清理过期的键
   */
  private isExpired(entry: CacheEntry): boolean {
    if (!entry.expiresAt) return false
    return Date.now() > entry.expiresAt
  }

  /**
   * 设置过期定时器
   */
  private setExpireTimer(key: string, ttl: number): void {
    // 清除旧定时器
    const oldTimer = this.timers.get(key)
    if (oldTimer) {
      clearTimeout(oldTimer)
    }

    // 设置新定时器
    const timer = setTimeout(() => {
      this.cache.delete(key)
      this.timers.delete(key)
    }, ttl * 1000)

    this.timers.set(key, timer)
  }

  /**
   * 序列化值
   */
  private serialize(value: any): string {
    return JSON.stringify(value)
  }

  /**
   * 反序列化值
   */
  private deserialize<T>(value: string): T {
    return JSON.parse(value)
  }

  // ========== 基础操作 ==========

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.timers.delete(key)
      return null
    }

    return entry.value as T
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined

    this.cache.set(key, { value, expiresAt })

    if (ttl) {
      this.setExpireTimer(key, ttl)
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key)

    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    if (!entry) return false

    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.timers.delete(key)
      return false
    }

    return true
  }

  // ========== 批量操作 ==========

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    const results: Array<T | null> = []

    for (const key of keys) {
      results.push(await this.get<T>(key))
    }

    return results
  }

  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl)
    }
  }

  async mdel(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.del(key)
    }
  }

  // ========== 哈希操作 ==========

  async hget<T>(key: string, field: string): Promise<T | null> {
    const hash = await this.get<Record<string, T>>(key)
    if (!hash) return null
    return hash[field] ?? null
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    let hash = await this.get<Record<string, T>>(key)
    if (!hash) {
      hash = {} as Record<string, T>
    }
    hash[field] = value
    await this.set(key, hash)
  }

  async hdel(key: string, field: string): Promise<void> {
    const hash = await this.get<Record<string, any>>(key)
    if (!hash) return

    delete hash[field]
    await this.set(key, hash)
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const hash = await this.get<Record<string, T>>(key)
    return hash || ({} as Record<string, T>)
  }

  // ========== 集合操作 ==========

  async sadd<T>(key: string, ...members: T[]): Promise<void> {
    let set = await this.get<T[]>(key)
    if (!set) {
      set = []
    }

    // 使用 Set 去重
    const uniqueSet = new Set(set)
    members.forEach((member) => uniqueSet.add(member))

    await this.set(key, Array.from(uniqueSet))
  }

  async srem<T>(key: string, ...members: T[]): Promise<void> {
    const set = await this.get<T[]>(key)
    if (!set) return

    const memberSet = new Set(members)
    const filtered = set.filter((item) => !memberSet.has(item))

    await this.set(key, filtered)
  }

  async smembers<T>(key: string): Promise<T[]> {
    const set = await this.get<T[]>(key)
    return set || []
  }

  async sismember<T>(key: string, member: T): Promise<boolean> {
    const set = await this.get<T[]>(key)
    if (!set) return false

    return set.includes(member)
  }

  // ========== 列表操作 ==========

  async lpush<T>(key: string, ...values: T[]): Promise<void> {
    let list = await this.get<T[]>(key)
    if (!list) {
      list = []
    }

    list.unshift(...values)
    await this.set(key, list)
  }

  async rpush<T>(key: string, ...values: T[]): Promise<void> {
    let list = await this.get<T[]>(key)
    if (!list) {
      list = []
    }

    list.push(...values)
    await this.set(key, list)
  }

  async lpop<T>(key: string): Promise<T | null> {
    const list = await this.get<T[]>(key)
    if (!list || list.length === 0) return null

    const value = list.shift()!
    await this.set(key, list)

    return value
  }

  async rpop<T>(key: string): Promise<T | null> {
    const list = await this.get<T[]>(key)
    if (!list || list.length === 0) return null

    const value = list.pop()!
    await this.set(key, list)

    return value
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const list = await this.get<T[]>(key)
    if (!list) return []

    // Redis 风格的索引（支持负数）
    const len = list.length
    let startIdx = start < 0 ? Math.max(0, len + start) : Math.min(start, len)
    let stopIdx = stop < 0 ? Math.max(0, len + stop + 1) : Math.min(stop + 1, len)

    return list.slice(startIdx, stopIdx)
  }

  // ========== 管理操作 ==========

  async flush(): Promise<void> {
    // 清除所有定时器
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers.clear()

    // 清空缓存
    this.cache.clear()
  }

  async ping(): Promise<boolean> {
    return true
  }

  /**
   * 获取缓存统计信息（扩展方法）
   */
  getStats(): {
    keys: number
    memoryUsage: number
  } {
    let memoryUsage = 0

    // 估算内存使用（粗略）
    this.cache.forEach((entry) => {
      const serialized = JSON.stringify(entry.value)
      memoryUsage += serialized.length * 2 // UTF-16
    })

    return {
      keys: this.cache.size,
      memoryUsage,
    }
  }
}
