/**
 * Realtime Factory
 * 根据配置创建不同的实时通信服务实现
 */

import type { IRealtimeService } from './interfaces/realtime.interface.js'
import type { Redis } from 'ioredis'

export type RealtimeType = 'websocket' | 'redis-pubsub'

export interface RealtimeFactoryOptions {
  realtimeType: RealtimeType
  // WebSocket 相关配置
  wsManager?: any // WebSocketManager 类型，将在实现时定义
  // Redis Pub/Sub 相关配置
  redisPublisher?: Redis
  redisSubscriber?: Redis
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
        if (!options.wsManager) {
          throw new Error('WebSocket Manager is required when realtimeType is "websocket"')
        }
        // 将在 Phase 5 实现
        throw new Error('WebSocket Realtime Service not implemented yet')

      case 'redis-pubsub':
        if (!options.redisPublisher || !options.redisSubscriber) {
          throw new Error(
            'Redis publisher and subscriber are required when realtimeType is "redis-pubsub"'
          )
        }
        // 将在 Phase 5 实现
        throw new Error('Redis Pub/Sub Realtime Service not implemented yet')

      default:
        throw new Error(`Unsupported realtime type: ${options.realtimeType}`)
    }
  }
}
