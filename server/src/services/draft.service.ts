/**
 * DraftService — 草稿审批服务（Phase 11 T4）
 * Claw 生成草稿 → 人类批准 → 自动发送消息
 */

import { randomUUID } from 'node:crypto'
import type { IDraftRepository, DraftRecord, DraftStatus } from '../db/repositories/interfaces/draft.repository.interface.js'
import type { MessageService } from './message.service.js'

export class DraftService {
  constructor(
    private draftRepo: IDraftRepository,
    private messageService: MessageService,
  ) {}

  /**
   * 创建草稿（Agent 生成，等待人类审批）
   */
  async create(
    clawId: string,
    toClawId: string,
    content: string,
    reason: string,
    expiresAt?: string,
  ): Promise<DraftRecord> {
    const id = `draft_${randomUUID().replace(/-/g, '').slice(0, 12)}`
    return this.draftRepo.create({ id, clawId, toClawId, content, reason, expiresAt })
  }

  /**
   * 列出草稿（可按状态过滤）
   */
  async list(
    clawId: string,
    filters?: { status?: DraftStatus; limit?: number; offset?: number },
  ): Promise<DraftRecord[]> {
    return this.draftRepo.findByOwner(clawId, filters)
  }

  /**
   * 获取单个草稿（校验所有权）
   */
  async findById(id: string, clawId: string): Promise<DraftRecord | null> {
    const draft = await this.draftRepo.findById(id)
    if (!draft || draft.clawId !== clawId) return null
    return draft
  }

  /**
   * 批准草稿并发送消息
   */
  async approve(
    draftId: string,
    clawId: string,
  ): Promise<{ draft: DraftRecord; messageId: string }> {
    const draft = await this.draftRepo.findById(draftId)
    if (!draft) throw new Error(`Draft ${draftId} not found`)
    if (draft.clawId !== clawId) throw new Error('Access denied: not the draft owner')
    if (draft.status !== 'pending') throw new Error(`Draft is already ${draft.status}`)

    // 发送消息
    const result = await this.messageService.sendMessage(clawId, {
      blocks: [{ type: 'text', text: draft.content }],
      visibility: 'direct',
      toClawIds: [draft.toClawId],
    })

    const sentMessageId = result.message.id
    const updated = await this.draftRepo.updateStatus(draftId, 'approved', { sentMessageId })

    return { draft: updated, messageId: sentMessageId }
  }

  /**
   * 拒绝草稿
   */
  async reject(draftId: string, clawId: string): Promise<DraftRecord> {
    const draft = await this.draftRepo.findById(draftId)
    if (!draft) throw new Error(`Draft ${draftId} not found`)
    if (draft.clawId !== clawId) throw new Error('Access denied: not the draft owner')
    if (draft.status !== 'pending') throw new Error(`Draft is already ${draft.status}`)

    return this.draftRepo.updateStatus(draftId, 'rejected')
  }

  /**
   * 获取草稿统计
   */
  async getStats(clawId: string): Promise<{ pending: number; approved: number; rejected: number }> {
    // 使用足够大的 limit 来获取准确计数（生产环境可改用 COUNT 查询）
    const [pending, approved, rejected] = await Promise.all([
      this.draftRepo.findByOwner(clawId, { status: 'pending', limit: 1000 }),
      this.draftRepo.findByOwner(clawId, { status: 'approved', limit: 1000 }),
      this.draftRepo.findByOwner(clawId, { status: 'rejected', limit: 1000 }),
    ])
    return {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
    }
  }
}
