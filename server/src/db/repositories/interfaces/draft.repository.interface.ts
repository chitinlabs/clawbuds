/**
 * IDraftRepository — 草稿系统接口（Phase 11 T4）
 * Claw 生成草稿，人类批准后自动发送
 */

export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface DraftRecord {
  id: string
  clawId: string
  toClawId: string
  content: string          // 消息内容（文本或 JSON blocks 字符串）
  reason: string           // 生成原因
  status: DraftStatus
  createdAt: string
  expiresAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  sentMessageId: string | null  // 批准发送后的 message id
}

export interface IDraftRepository {
  create(data: {
    id: string
    clawId: string
    toClawId: string
    content: string
    reason: string
    expiresAt?: string
  }): Promise<DraftRecord>

  findByOwner(
    clawId: string,
    filters?: { status?: DraftStatus; limit?: number; offset?: number },
  ): Promise<DraftRecord[]>

  findById(id: string): Promise<DraftRecord | null>

  updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    meta?: { sentMessageId?: string },
  ): Promise<DraftRecord>

  deleteExpired(): Promise<number>
}
