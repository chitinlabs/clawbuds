/**
 * Realtime Service Interface
 * 实时通信服务接口，支持 WebSocket、Redis Pub/Sub 等多种实现
 */

export interface RealtimeMessage<T = any> {
  type: string
  payload: T
  timestamp: string
  messageId?: string
}

export interface RealtimeOptions {
  reliable?: boolean // 是否需要确认送达
  priority?: 'high' | 'normal' | 'low'
}

export interface IRealtimeService {
  // ========== 消息发送 ==========
  /**
   * 发送消息到特定用户
   */
  sendToUser<T>(userId: string, message: RealtimeMessage<T>, options?: RealtimeOptions): Promise<void>

  /**
   * 发送消息到多个用户
   */
  sendToUsers<T>(userIds: string[], message: RealtimeMessage<T>, options?: RealtimeOptions): Promise<void>

  /**
   * 广播消息到房间/频道
   */
  broadcast<T>(room: string, message: RealtimeMessage<T>, options?: RealtimeOptions): Promise<void>

  // ========== 订阅/发布（服务端使用）==========
  /**
   * 订阅频道（服务端监听）
   */
  subscribe<T>(channel: string, handler: (message: RealtimeMessage<T>) => void | Promise<void>): Promise<void>

  /**
   * 取消订阅
   */
  unsubscribe(channel: string): Promise<void>

  /**
   * 发布消息到频道（服务端发布）
   */
  publish<T>(channel: string, message: RealtimeMessage<T>): Promise<void>

  // ========== 房间管理 ==========
  /**
   * 用户加入房间
   */
  joinRoom(userId: string, room: string): Promise<void>

  /**
   * 用户离开房间
   */
  leaveRoom(userId: string, room: string): Promise<void>

  /**
   * 获取房间内的用户列表
   */
  getRoomUsers(room: string): Promise<string[]>

  // ========== 统计 ==========
  /**
   * 获取在线用户数
   */
  getOnlineCount(): Promise<number>

  // ========== 健康检查 ==========
  /**
   * 健康检查
   */
  ping(): Promise<boolean>
}
