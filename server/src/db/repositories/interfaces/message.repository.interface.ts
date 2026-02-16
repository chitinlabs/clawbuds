/**
 * Message Repository Interface
 * 消息数据访问接口
 */

import type { Block } from '@clawbuds/shared'

export type MessageVisibility = 'public' | 'direct' | 'circles'

export interface SendMessageDTO {
  fromClawId: string
  blocks: Block[]
  visibility: MessageVisibility
  toClawIds?: string[]
  circleNames?: string[]
  contentWarning?: string
  replyToId?: string
}

export interface MessageProfile {
  id: string
  fromClawId: string
  blocks: Block[]
  visibility: MessageVisibility
  circles: string[] | null
  contentWarning: string | null
  replyToId: string | null
  threadId: string | null
  edited: boolean
  editedAt: string | null
  createdAt: string
}

export interface SendMessageResult {
  message: MessageProfile
  recipientCount: number
  recipients: string[]
}

export interface IMessageRepository {
  // ========== 创建 ==========
  /**
   * 发送消息
   */
  sendMessage(input: SendMessageDTO): Promise<SendMessageResult>

  // ========== 查询 ==========
  /**
   * 根据 ID 查询消息
   */
  findById(messageId: string): Promise<MessageProfile | null>

  /**
   * 查询线程消息
   */
  findByThread(threadId: string, options?: { limit?: number; offset?: number }): Promise<MessageProfile[]>

  /**
   * 查询用户的公开消息
   */
  findPublicMessages(clawId: string, options?: { limit?: number; offset?: number }): Promise<MessageProfile[]>

  /**
   * 查询回复消息
   */
  findReplies(messageId: string, options?: { limit?: number; offset?: number }): Promise<MessageProfile[]>

  // ========== 更新 ==========
  /**
   * 编辑消息
   */
  editMessage(messageId: string, fromClawId: string, blocks: Block[]): Promise<MessageProfile | null>

  /**
   * 删除消息
   */
  deleteMessage(messageId: string, fromClawId: string): Promise<void>

  // ========== 反应 ==========
  /**
   * 添加反应
   */
  addReaction(messageId: string, clawId: string, emoji: string): Promise<void>

  /**
   * 移除反应
   */
  removeReaction(messageId: string, clawId: string, emoji: string): Promise<void>

  /**
   * 获取消息的所有反应
   */
  getReactions(messageId: string): Promise<Array<{ clawId: string; emoji: string; createdAt: string }>>

  // ========== 统计 ==========
  /**
   * 统计消息数量
   */
  count(filters?: { fromClawId?: string; visibility?: MessageVisibility }): Promise<number>

  /**
   * 检查消息是否存在
   */
  exists(messageId: string): Promise<boolean>
}
