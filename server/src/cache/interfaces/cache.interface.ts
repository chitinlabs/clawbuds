/**
 * Cache Service Interface
 * 缓存服务接口，支持内存缓存、Redis等多种实现
 */

export interface ICacheService {
  // ========== 基础操作 ==========
  /**
   * 获取缓存值
   */
  get<T>(key: string): Promise<T | null>

  /**
   * 设置缓存值
   * @param ttl - 过期时间（秒），undefined 表示永不过期
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>

  /**
   * 删除缓存
   */
  del(key: string): Promise<void>

  /**
   * 检查键是否存在
   */
  exists(key: string): Promise<boolean>

  // ========== 批量操作 ==========
  /**
   * 批量获取
   */
  mget<T>(keys: string[]): Promise<Array<T | null>>

  /**
   * 批量设置
   */
  mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void>

  /**
   * 批量删除
   */
  mdel(keys: string[]): Promise<void>

  // ========== 哈希操作 ==========
  /**
   * 获取哈希字段值
   */
  hget<T>(key: string, field: string): Promise<T | null>

  /**
   * 设置哈希字段值
   */
  hset<T>(key: string, field: string, value: T): Promise<void>

  /**
   * 删除哈希字段
   */
  hdel(key: string, field: string): Promise<void>

  /**
   * 获取哈希所有字段
   */
  hgetall<T>(key: string): Promise<Record<string, T>>

  // ========== 集合操作 ==========
  /**
   * 添加集合成员
   */
  sadd<T>(key: string, ...members: T[]): Promise<void>

  /**
   * 移除集合成员
   */
  srem<T>(key: string, ...members: T[]): Promise<void>

  /**
   * 获取集合所有成员
   */
  smembers<T>(key: string): Promise<T[]>

  /**
   * 检查是否是集合成员
   */
  sismember<T>(key: string, member: T): Promise<boolean>

  // ========== 列表操作 ==========
  /**
   * 从列表左侧推入
   */
  lpush<T>(key: string, ...values: T[]): Promise<void>

  /**
   * 从列表右侧推入
   */
  rpush<T>(key: string, ...values: T[]): Promise<void>

  /**
   * 从列表左侧弹出
   */
  lpop<T>(key: string): Promise<T | null>

  /**
   * 从列表右侧弹出
   */
  rpop<T>(key: string): Promise<T | null>

  /**
   * 获取列表范围
   */
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>

  // ========== 管理操作 ==========
  /**
   * 清空所有缓存
   */
  flush(): Promise<void>

  /**
   * 健康检查
   */
  ping(): Promise<boolean>
}
