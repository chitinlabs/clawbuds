/**
 * WebSocket Realtime Service
 * 基于 WebSocket 的实时通信服务实现
 */

import type { WebSocket } from 'ws'
import type {
  IRealtimeService,
  RealtimeMessage,
  RealtimeOptions,
} from '../interfaces/realtime.interface.js'

interface UserConnection {
  userId: string
  ws: WebSocket
  rooms: Set<string>
}

export class WebSocketRealtimeService implements IRealtimeService {
  // userId -> UserConnection
  private connections: Map<string, UserConnection>
  // room -> Set<userId>
  private rooms: Map<string, Set<string>>
  // channel -> handlers
  private channelHandlers: Map<string, Array<(message: RealtimeMessage<any>) => void | Promise<void>>>

  constructor() {
    this.connections = new Map()
    this.rooms = new Map()
    this.channelHandlers = new Map()
  }

  // ========== 连接管理（扩展方法）==========

  /**
   * 注册 WebSocket 连接
   */
  registerConnection(userId: string, ws: WebSocket): void {
    // 关闭旧连接（如果存在）
    const oldConnection = this.connections.get(userId)
    if (oldConnection) {
      oldConnection.ws.close()
    }

    const connection: UserConnection = {
      userId,
      ws,
      rooms: new Set(),
    }

    this.connections.set(userId, connection)

    // 监听断开连接
    ws.on('close', () => {
      this.unregisterConnection(userId)
    })
  }

  /**
   * 注销连接
   */
  unregisterConnection(userId: string): void {
    const connection = this.connections.get(userId)
    if (!connection) return

    // 从所有房间中移除
    connection.rooms.forEach((room) => {
      const roomUsers = this.rooms.get(room)
      if (roomUsers) {
        roomUsers.delete(userId)
        if (roomUsers.size === 0) {
          this.rooms.delete(room)
        }
      }
    })

    this.connections.delete(userId)
  }

  /**
   * 获取用户连接
   */
  private getConnection(userId: string): UserConnection | undefined {
    return this.connections.get(userId)
  }

  // ========== 消息发送 ==========

  async sendToUser<T>(
    userId: string,
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const connection = this.getConnection(userId)
    if (!connection) {
      // 用户不在线，忽略或记录
      return
    }

    if (connection.ws.readyState === 1) {
      // WebSocket.OPEN
      const data = JSON.stringify(message)
      connection.ws.send(data)
    }
  }

  async sendToUsers<T>(
    userIds: string[],
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const sendPromises = userIds.map((userId) =>
      this.sendToUser(userId, message, options),
    )
    await Promise.all(sendPromises)
  }

  async broadcast<T>(
    room: string,
    message: RealtimeMessage<T>,
    options?: RealtimeOptions,
  ): Promise<void> {
    const roomUsers = this.rooms.get(room)
    if (!roomUsers || roomUsers.size === 0) {
      return
    }

    const userIds = Array.from(roomUsers)
    await this.sendToUsers(userIds, message, options)
  }

  // ========== 订阅/发布（服务端使用）==========

  async subscribe<T>(
    channel: string,
    handler: (message: RealtimeMessage<T>) => void | Promise<void>,
  ): Promise<void> {
    let handlers = this.channelHandlers.get(channel)
    if (!handlers) {
      handlers = []
      this.channelHandlers.set(channel, handlers)
    }

    handlers.push(handler as any)
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channelHandlers.delete(channel)
  }

  async publish<T>(channel: string, message: RealtimeMessage<T>): Promise<void> {
    const handlers = this.channelHandlers.get(channel)
    if (!handlers || handlers.length === 0) {
      return
    }

    // 触发所有订阅的处理器
    const promises = handlers.map((handler) => {
      try {
        const result = handler(message)
        return result instanceof Promise ? result : Promise.resolve()
      } catch (error) {
        console.error('Error in channel handler:', error)
        return Promise.resolve()
      }
    })

    await Promise.all(promises)
  }

  // ========== 房间管理 ==========

  async joinRoom(userId: string, room: string): Promise<void> {
    const connection = this.getConnection(userId)
    if (!connection) {
      throw new Error(`User ${userId} is not connected`)
    }

    // 添加到用户的房间集合
    connection.rooms.add(room)

    // 添加到房间的用户集合
    let roomUsers = this.rooms.get(room)
    if (!roomUsers) {
      roomUsers = new Set()
      this.rooms.set(room, roomUsers)
    }
    roomUsers.add(userId)
  }

  async leaveRoom(userId: string, room: string): Promise<void> {
    const connection = this.getConnection(userId)
    if (!connection) {
      return
    }

    // 从用户的房间集合中移除
    connection.rooms.delete(room)

    // 从房间的用户集合中移除
    const roomUsers = this.rooms.get(room)
    if (roomUsers) {
      roomUsers.delete(userId)
      if (roomUsers.size === 0) {
        this.rooms.delete(room)
      }
    }
  }

  async getRoomUsers(room: string): Promise<string[]> {
    const roomUsers = this.rooms.get(room)
    return roomUsers ? Array.from(roomUsers) : []
  }

  // ========== 统计 ==========

  async getOnlineCount(): Promise<number> {
    return this.connections.size
  }

  /**
   * 获取所有房间列表（扩展方法）
   */
  getRooms(): string[] {
    return Array.from(this.rooms.keys())
  }

  /**
   * 获取连接统计（扩展方法）
   */
  getStats(): {
    connections: number
    rooms: number
    channels: number
  } {
    return {
      connections: this.connections.size,
      rooms: this.rooms.size,
      channels: this.channelHandlers.size,
    }
  }

  // ========== 健康检查 ==========

  async ping(): Promise<boolean> {
    return true
  }

  /**
   * 清理断开的连接（扩展方法）
   */
  cleanup(): void {
    const deadConnections: string[] = []

    this.connections.forEach((connection, userId) => {
      if (connection.ws.readyState === 3) {
        // WebSocket.CLOSED
        deadConnections.push(userId)
      }
    })

    deadConnections.forEach((userId) => {
      this.unregisterConnection(userId)
    })
  }
}
