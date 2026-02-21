/**
 * ThreadService (Phase 8)
 * Thread V5 协作话题工作区生命周期管理
 * E2EE: 服务端只处理密文，不接触明文贡献内容
 */

import { randomUUID } from 'node:crypto'
import type {
  IThreadRepository,
  IThreadContributionRepository,
  IThreadKeyRepository,
  ThreadRecord,
  ThreadContributionRecord,
  ThreadKeyRecord,
  ThreadPurpose,
  ThreadStatus,
  ContributionType,
} from '../db/repositories/interfaces/thread.repository.interface.js'
import type { FriendshipService } from './friendship.service.js'
import type { HostNotifier } from './host-notifier.js'
import type { EventBus } from './event-bus.js'

/** HTTP-like 错误，含状态码 */
export class ThreadServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'ThreadServiceError'
  }
}

export class ThreadService {
  constructor(
    private readonly threadRepo: IThreadRepository,
    private readonly contributionRepo: IThreadContributionRepository,
    private readonly threadKeyRepo: IThreadKeyRepository,
    private readonly friendshipService: FriendshipService,
    private readonly hostNotifier: HostNotifier,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * 创建 Thread
   * - creator 自动成为参与者
   * - 所有 participants 必须是 creator 的好友
   * - E2EE: encryptedKeys 中每位参与者的份额写入 thread_keys
   */
  async create(
    creatorId: string,
    data: {
      purpose: ThreadPurpose
      title: string
      participants?: string[]
      encryptedKeys?: Record<string, string>
    },
  ): Promise<ThreadRecord> {
    // 验证所有参与者必须是 creator 的好友
    if (data.participants && data.participants.length > 0) {
      for (const participantId of data.participants) {
        const areFriends = await this.friendshipService.areFriends(creatorId, participantId)
        if (!areFriends) {
          throw new ThreadServiceError(
            `Participant ${participantId} is not a friend of creator`,
            403,
          )
        }
      }
    }

    const threadId = randomUUID()
    const thread = await this.threadRepo.create({
      id: threadId,
      creatorId,
      purpose: data.purpose,
      title: data.title,
    })

    // creator 自动成为参与者
    await this.threadRepo.addParticipant(threadId, creatorId)

    // 邀请其他参与者
    const participantIds = [creatorId]
    if (data.participants) {
      for (const participantId of data.participants) {
        await this.threadRepo.addParticipant(threadId, participantId)
        participantIds.push(participantId)
      }
    }

    // E2EE: 保存各参与者的密钥份额
    if (data.encryptedKeys) {
      for (const [clawId, encryptedKey] of Object.entries(data.encryptedKeys)) {
        await this.threadKeyRepo.upsert({
          threadId,
          clawId,
          encryptedKey,
          distributedBy: creatorId,
        })
      }
    }

    this.eventBus.emit('thread.created', {
      threadId,
      creatorId,
      purpose: data.purpose,
      participantIds,
    })

    return thread
  }

  /**
   * 按 ID 查询 Thread（含权限检查：只有参与者可以查看）
   */
  async findById(threadId: string, requesterId: string): Promise<ThreadRecord | null> {
    const thread = await this.threadRepo.findById(threadId)
    if (!thread) return null

    const isParticipant = await this.threadRepo.isParticipant(threadId, requesterId)
    if (!isParticipant) return null

    return thread
  }

  /**
   * 查询我参与的所有 Thread
   */
  async findMyThreads(
    clawId: string,
    filters?: {
      status?: ThreadStatus
      purpose?: ThreadPurpose
      limit?: number
      offset?: number
    },
  ): Promise<ThreadRecord[]> {
    return this.threadRepo.findByParticipant(clawId, filters)
  }

  /**
   * 提交贡献（E2EE）
   * - 验证参与者身份
   * - 验证 Thread 为 active 状态
   * - 只接受密文 + nonce，不接受明文
   */
  async contribute(
    threadId: string,
    contributorId: string,
    encryptedContent: string,
    nonce: string,
    contentType: ContributionType,
  ): Promise<ThreadContributionRecord> {
    // 验证参与者
    const isParticipant = await this.threadRepo.isParticipant(threadId, contributorId)
    if (!isParticipant) {
      throw new ThreadServiceError('Not a participant', 403)
    }

    // 验证 Thread 状态
    const thread = await this.threadRepo.findById(threadId)
    if (!thread || thread.status !== 'active') {
      throw new ThreadServiceError('Thread is not active', 400)
    }

    const contributionId = randomUUID()
    const contribution = await this.contributionRepo.create({
      id: contributionId,
      threadId,
      contributorId,
      encryptedContent,
      nonce,
      contentType,
    })

    // 更新 thread.updated_at
    await this.threadRepo.touch(threadId)

    // 获取当前贡献数
    const contributionCount = await this.contributionRepo.countByThread(threadId)

    // 触发事件（Phase 4 track_thread_progress Reflex 会监听此事件）
    this.eventBus.emit('thread.contribution_added', {
      threadId,
      contributorId,
      contributionId,
      contentType,
      purpose: thread.purpose,
      contributionCount,
    })

    return contribution
  }

  /**
   * 获取 Thread 贡献历史（返回密文，由客户端解密）
   */
  async getContributions(
    threadId: string,
    requesterId: string,
    filters?: { since?: string; limit?: number },
  ): Promise<ThreadContributionRecord[]> {
    const isParticipant = await this.threadRepo.isParticipant(threadId, requesterId)
    if (!isParticipant) {
      throw new ThreadServiceError('Not a participant', 403)
    }

    return this.contributionRepo.findByThread(threadId, filters)
  }

  /**
   * 获取当前请求者的 Thread 密钥份额
   */
  async getMyKey(threadId: string, clawId: string): Promise<ThreadKeyRecord | null> {
    return this.threadKeyRepo.findByThreadAndClaw(threadId, clawId)
  }

  /**
   * 邀请好友加入 Thread（E2EE）
   * - 邀请方必须是参与者
   * - 被邀请方必须是邀请方的好友
   * - encryptedKeyForInvitee 写入 thread_keys
   */
  async invite(
    threadId: string,
    inviterId: string,
    inviteeId: string,
    encryptedKeyForInvitee: string,
  ): Promise<void> {
    // 验证邀请方是参与者
    const isInviterParticipant = await this.threadRepo.isParticipant(threadId, inviterId)
    if (!isInviterParticipant) {
      throw new ThreadServiceError('Not a participant', 403)
    }

    // 验证被邀请方是好友
    const areFriends = await this.friendshipService.areFriends(inviterId, inviteeId)
    if (!areFriends) {
      throw new ThreadServiceError('Not friends', 403)
    }

    // 添加参与者
    await this.threadRepo.addParticipant(threadId, inviteeId)

    // E2EE: 保存被邀请方的密钥份额
    await this.threadKeyRepo.upsert({
      threadId,
      clawId: inviteeId,
      encryptedKey: encryptedKeyForInvitee,
      distributedBy: inviterId,
    })
  }

  /**
   * 请求 AI 生成个性化摘要
   * - 触发 LLM_REQUEST → Agent 异步生成，通过 notify() 推送结果
   * - 注意：AI 摘要在参与者宿主 LLM 完成，服务端不传递解密后内容
   */
  async requestDigest(threadId: string, forClawId: string): Promise<void> {
    const isParticipant = await this.threadRepo.isParticipant(threadId, forClawId)
    if (!isParticipant) {
      throw new ThreadServiceError('Not a participant', 403)
    }

    const thread = await this.threadRepo.findById(threadId)
    if (!thread) {
      throw new ThreadServiceError('Thread not found', 404)
    }

    const contributionCount = await this.contributionRepo.countByThread(threadId)
    const participants = await this.threadRepo.getParticipants(threadId)

    // 触发 LLM_REQUEST（fire-and-forget）
    await this.hostNotifier.triggerAgent({
      batchId: randomUUID(),
      type: 'LLM_REQUEST',
      message: `[LLM_REQUEST] 请为 ${forClawId} 生成 Thread 个性化摘要\n\nThread: "${thread.title}" (purpose: ${thread.purpose})\n参与者: ${participants.length} 人\n贡献数: ${contributionCount} 条\n请求方: ${forClawId}\n\n请在客户端本地解密贡献内容后生成摘要，通过 notify() 直接推送给用户。`,
      metadata: {
        threadId,
        forClawId,
        purpose: thread.purpose,
        contributionCount,
      },
    })
  }

  /**
   * 更新 Thread 状态（只有 creator 可以操作）
   */
  async updateStatus(
    threadId: string,
    requesterId: string,
    status: 'completed' | 'archived' | 'active',
  ): Promise<void> {
    const thread = await this.threadRepo.findById(threadId)
    if (!thread) {
      throw new ThreadServiceError('Thread not found', 404)
    }

    if (thread.creatorId !== requesterId) {
      throw new ThreadServiceError('Only creator can change status', 403)
    }

    const oldStatus = thread.status
    await this.threadRepo.updateStatus(threadId, status)

    this.eventBus.emit('thread.status_changed', {
      threadId,
      oldStatus,
      newStatus: status,
    })
  }
}
