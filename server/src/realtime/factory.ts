/**
 * Realtime Factory
 * 根据配置创建不同的实时通信服务实现
 */

import type { IRealtimeService } from './interfaces/realtime.interface.js'
import type { Redis } from 'ioredis'

// Realtime 实现
import { WebSocketRealtimeService } from './websocket/websocket-realtime.service.js'
import { RedisPubSubRealtimeService } from './redis/redis-pubsub-realtime.service.js'

export type RealtimeType = 'websocket' | 'redis-pubsub'

export interface RealtimeFactoryOptions {
  realtimeType: RealtimeType
  // WebSocket 相关配置（已实现，使用内置的 WebSocketRealtimeService）
  // Redis Pub/Sub 相关配置
  redisPublisher?: Redis
  redisSubscriber?: Redis
  keyPrefix?: string
}

/**
 * Realtime 工厂类
 * 负责创建实时通信服务实例
 */
export class RealtimeFactory {
  /**
   * 创建 Realtime 服务实例
   */
  static create(options: RealtimeFactoryOptions): IRealtimeService {
    switch (options.realtimeType) {
      case 'websocket':
        return new WebSocketRealtimeService()

      case 'redis-pubsub':
        if (!options.redisPublisher || !options.redisSubscriber) {
          throw new Error(
            'Redis publisher and subscriber are required when realtimeType is "redis-pubsub"'
          )
        }
        return new RedisPubSubRealtimeService({
          publisher: options.redisPublisher,
          subscriber: options.redisSubscriber,
          keyPrefix: options.keyPrefix,
        })

      default:
        throw new Error(`Unsupported realtime type: ${options.realtimeType}`)
    }
  }
}
