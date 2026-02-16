/**
 * Redis Pub/Sub Realtime Service
 * 基于 Redis Pub/Sub 的分布式实时通信服务实现
 */

import type { Redis } from 'ioredis'
import type {
  IRealtimeService,
  RealtimeMessage,
  RealtimeOptions,
} from '../interfaces/realtime.interface.js'

export interface RedisPubSubOptions {
  /** Redis 发布者客户端 */
  publisher: Redis
  /** Redis 订阅者客户端 */
  subscriber: Redis
  /** 键前缀 */
  keyPrefix?: string
}

export class RedisPubSubRealtimeService implements IRealtimeService {
  private publisher: Redis
  private subscriber: Redis
  private keyPrefix: string
  private channelHandlers: Map<string, Array<(message: RealtimeMessage<any>) => void | Promise<void>>>

  constructor(options: RedisPubSubOptions) {
    this.publisher = options.publisher
    this.subscriber = options.subscriber
    this.keyPrefix = options.keyPrefix || 'realtime:'
    this.channelHandlers = new Map()

    // 监听 Redis 消息
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message)
    })
  }

  // ========== 辅助方法 ==========

  /**
   * 获取完整的键名
   */
  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  /**
   * 获取用户频道
   */
  private getUserChannel(userId: string): string {
    return this.getKey(`user:${userId}`)
  }

  /**
   * 获取房间频道
   */
  private getRoomChannel(room: string): string {
    return this.getKey(`room:${room}`)
  }

  /**
   * 获取房间成员集合键
   */
  private getRoomMembersKey(room: string): string {
    return this.getKey(`room:${room}:members`)
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(channel: string, messageStr: string): void {
    try {
      const message: RealtimeMessage<any> = JSON.parse(messageStr)
      const handlers = this.channelHandlers.get(channel)

      if (handlers && handlers.length > 0) {
        handlers.forEach((handler) => {
          try {
            const result = handler(message)
            if (result instanceof Promise) {
              result.catch((error) => {
                console.error('Error in channel handler:', error)
              })
            }
          } catch (error) {
            console.error('Error in channel handler:', error)
          }
        })
      }
    } catch (error) {
      console.error('Error parsing message:', error)
    }
  }

  // ========== 消息发送 ==========

  async sendToUser<T>(
    userId: string,
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const channel = this.getUserChannel(userId)
    const messageStr = JSON.stringify(message)
    await this.publisher.publish(channel, messageStr)
  }

  async sendToUsers<T>(
    userIds: string[],
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const messageStr = JSON.stringify(message)
    const pipeline = this.publisher.pipeline()

    userIds.forEach((userId) => {
      const channel = this.getUserChannel(userId)
      pipeline.publish(channel, messageStr)
    })

    await pipeline.exec()
  }

  async broadcast<T>(
    room: string,
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const channel = this.getRoomChannel(room)
    const messageStr = JSON.stringify(message)
    await this.publisher.publish(channel, messageStr)
  }

  // ========== 订阅/发布（服务端使用）==========

  async subscribe<T>(
    channel: string,
    handler: (message: RealtimeMessage<T>) => void | Promise<void>,
  ): Promise<void> {
    const fullChannel = this.getKey(channel)

    // 添加处理器
    let handlers = this.channelHandlers.get(fullChannel)
    if (!handlers) {
      handlers = []
      this.channelHandlers.set(fullChannel, handlers)
    }
    handlers.push(handler as any)

    // 订阅 Redis 频道
    await this.subscriber.subscribe(fullChannel)
  }

  async unsubscribe(channel: string): Promise<void> {
    const fullChannel = this.getKey(channel)

    // 移除处理器
    this.channelHandlers.delete(fullChannel)

    // 取消订阅 Redis 频道
    await this.subscriber.unsubscribe(fullChannel)
  }

  async publish<T>(channel: string, message: RealtimeMessage<T>): Promise<void> {
    const fullChannel = this.getKey(channel)
    const messageStr = JSON.stringify(message)
    await this.publisher.publish(fullChannel, messageStr)
  }

  // ========== 房间管理 ==========

  async joinRoom(userId: string, room: string): Promise<void> {
    const roomMembersKey = this.getRoomMembersKey(room)
    const roomChannel = this.getRoomChannel(room)

    // 将用户添加到房间成员集合
    await this.publisher.sadd(roomMembersKey, userId)

    // 订阅房间频道（用户客户端需要自己订阅）
    // 这里我们只是记录成员关系
  }

  async leaveRoom(userId: string, room: string): Promise<void> {
    const roomMembersKey = this.getRoomMembersKey(room)

    // 从房间成员集合中移除用户
    await this.publisher.srem(roomMembersKey, userId)
  }

  async getRoomUsers(room: string): Promise<string[]> {
    const roomMembersKey = this.getRoomMembersKey(room)
    const members = await this.publisher.smembers(roomMembersKey)
    return members
  }

  // ========== 统计 ==========

  async getOnlineCount(): Promise<number> {
    // Redis Pub/Sub 不直接追踪在线用户
    // 需要配合其他机制（如心跳、用户在线集合等）
    // 这里返回一个估算值或者使用专门的在线用户集合
    const onlineKey = this.getKey('online:users')
    return this.publisher.scard(onlineKey)
  }

  /**
   * 标记用户在线（扩展方法）
   */
  async setUserOnline(userId: string, ttl: number = 300): Promise<void> {
    const onlineKey = this.getKey('online:users')
    await this.publisher.sadd(onlineKey, userId)

    // 设置用户在线状态的过期时间
    const userOnlineKey = this.getKey(`online:${userId}`)
    await this.publisher.setex(userOnlineKey, ttl, '1')
  }

  /**
   * 标记用户离线（扩展方法）
   */
  async setUserOffline(userId: string): Promise<void> {
    const onlineKey = this.getKey('online:users')
    await this.publisher.srem(onlineKey, userId)

    const userOnlineKey = this.getKey(`online:${userId}`)
    await this.publisher.del(userOnlineKey)
  }

  /**
   * 检查用户是否在线（扩展方法）
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const userOnlineKey = this.getKey(`online:${userId}`)
    const result = await this.publisher.exists(userOnlineKey)
    return result === 1
  }

  // ========== 健康检查 ==========

  async ping(): Promise<boolean> {
    try {
      const publisherPong = await this.publisher.ping()
      const subscriberPong = await this.subscriber.ping()
      return publisherPong === 'PONG' && subscriberPong === 'PONG'
    } catch {
      return false
    }
  }

  /**
   * 清理过期的房间（扩展方法）
   */
  async cleanupEmptyRooms(): Promise<void> {
    const pattern = this.getKey('room:*:members')
    const keys = await this.publisher.keys(pattern)

    const pipeline = this.publisher.pipeline()

    for (const key of keys) {
      const count = await this.publisher.scard(key)
      if (count === 0) {
        pipeline.del(key)
      }
    }

    await pipeline.exec()
  }

  /**
   * 获取统计信息（扩展方法）
   */
  async getStats(): Promise<{
    onlineUsers: number
    rooms: number
    channels: number
  }> {
    const onlineKey = this.getKey('online:users')
    const onlineUsers = await this.publisher.scard(onlineKey)

    const roomPattern = this.getKey('room:*:members')
    const roomKeys = await this.publisher.keys(roomPattern)

    return {
      onlineUsers,
      rooms: roomKeys.length,
      channels: this.channelHandlers.size,
    }
  }

  /**
   * 关闭连接（扩展方法）
   */
  async close(): Promise<void> {
    await this.subscriber.quit()
    // publisher 可能被其他服务共享，不主动关闭
  }
}
