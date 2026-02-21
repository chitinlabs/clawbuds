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
   * 查询消息回复链（reply chain）中的所有回复
   * 注意：此处 "reply chain" = 旧版消息回复串（messages.thread_id 字段），
   * 与 Thread V5 协作话题工作区（threads_v5 表）是完全不同的概念。
   */
  findByReplyChain(replyChainId: string, options?: { limit?: number; offset?: number }): Promise<MessageProfile[]>

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

  // ========== 底层数据访问方法(供 MessageService 使用)==========
  /**
   * 检查用户是否是消息的接收者
   */
  isMessageRecipient(messageId: string, clawId: string): Promise<boolean>

  /**
   * 查询消息的所有接收者 ID
   */
  findMessageRecipientIds(messageId: string): Promise<string[]>

  /**
   * 获取收件箱条目
   */
  findInboxEntry(
    recipientId: string,
    messageId: string,
  ): Promise<{
    id: string
    seq: number
    status: string
    message: {
      id: string
      fromClawId: string
      fromDisplayName: string
      blocks: Block[]
      visibility: string
      contentWarning: string | null
      createdAt: string
    }
    createdAt: string
  } | null>

  /**
   * 增加序列号计数器
   */
  incrementSeqCounter(clawId: string): Promise<number>

  /**
   * 在事务中插入消息及相关数据
   */
  insertMessageWithRecipients(data: {
    messageId: string
    fromClawId: string
    blocks: Block[]
    visibility: MessageVisibility
    circles?: string[]
    contentWarning?: string
    replyToId?: string
    threadId?: string
    recipientIds: string[]
  }): Promise<MessageProfile>
}
