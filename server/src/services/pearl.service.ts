/**
 * PearlService (Phase 3)
 * Pearl 完整生命周期：创建、查询、更新、删除、分享、背书、Luster 计算
 */

import { randomUUID } from 'node:crypto'
import type { IPearlRepository, IPearlEndorsementRepository, PearlMetadataRecord, PearlContentRecord, PearlFullRecord, PearlReferenceRecord, PearlEndorsementRecord, PearlFilters, UpdatePearlData } from '../db/repositories/interfaces/pearl.repository.interface.js'
import type { FriendshipService } from './friendship.service.js'
import type { EventBus } from './event-bus.js'
import type { TrustService } from './trust.service.js'

/** Phase 7: 信任阈值未满足时抛出 */
export class TrustThresholdError extends Error {
  readonly code = 'TRUST_THRESHOLD'
  constructor(message: string) {
    super(message)
    this.name = 'TrustThresholdError'
  }
}

/**
 * 基于背书分数计算 Pearl 质量评分（Phase 3 简化版）
 *
 * 算法：以初始值 0.5 作为基准权重（相当于 1 票），与 N 个背书分取等权平均
 *   luster = (0.5 + sum(scores)) / (1 + N)
 *   然后 clamp 到 [0.1, 1.0]
 *
 * Phase 9 升级：改为信任加权版 sum(trust_i * score_i) / sum(trust_i)
 */
export function computeLuster(endorsementScores: number[]): number {
  if (endorsementScores.length === 0) return 0.5

  const baseline = 0.5
  const total = baseline + endorsementScores.reduce((sum, s) => sum + s, 0)
  const count = 1 + endorsementScores.length
  const luster = total / count

  return Math.max(0.1, Math.min(1.0, luster))
}

export class PearlService {
  constructor(
    private pearlRepo: IPearlRepository,
    private endorsementRepo: IPearlEndorsementRepository,
    private friendshipService: FriendshipService,
    private eventBus: EventBus,
    private trustService?: TrustService,  // Phase 7: 可选，信任阈值过滤
  ) {}

  /** 创建 Pearl（手动沉淀） */
  async create(
    ownerId: string,
    data: {
      type: 'insight' | 'framework' | 'experience'
      triggerText: string
      body?: string
      context?: string
      domainTags?: string[]
      shareability?: 'private' | 'friends_only' | 'public'
      shareConditions?: Record<string, unknown>
    },
  ): Promise<PearlContentRecord> {
    const pearl = await this.pearlRepo.create({
      id: randomUUID(),
      ownerId,
      type: data.type,
      triggerText: data.triggerText,
      domainTags: data.domainTags ?? [],
      shareability: data.shareability ?? 'friends_only',
      shareConditions: data.shareConditions ?? null,
      body: data.body ?? null,
      context: data.context ?? null,
      originType: 'manual',
    })

    this.eventBus.emit('pearl.created', {
      ownerId,
      pearlId: pearl.id,
      domainTags: pearl.domainTags,
    })

    return pearl
  }

  /** 按级别查询 Pearl */
  async findById(
    id: string,
    level: 0 | 1 | 2,
  ): Promise<PearlMetadataRecord | PearlContentRecord | PearlFullRecord | null> {
    return this.pearlRepo.findById(id, level)
  }

  /** 查询指定用户的 Pearl（Level 0） */
  async findByOwner(ownerId: string, filters?: PearlFilters): Promise<PearlMetadataRecord[]> {
    return this.pearlRepo.findByOwner(ownerId, filters)
  }

  /** 更新 Pearl（验证 requesterId == ownerId） */
  async update(
    id: string,
    requesterId: string,
    data: UpdatePearlData,
  ): Promise<PearlContentRecord> {
    const pearl = await this.pearlRepo.findById(id, 1)
    if (!pearl) {
      throw Object.assign(new Error('Pearl not found'), { code: 'NOT_FOUND' })
    }
    if ((pearl as PearlContentRecord).ownerId !== requesterId) {
      throw Object.assign(new Error('Permission denied'), { code: 'FORBIDDEN' })
    }
    return this.pearlRepo.update(id, data)
  }

  /** 删除 Pearl（验证 requesterId == ownerId） */
  async delete(id: string, requesterId: string): Promise<void> {
    const pearl = await this.pearlRepo.findById(id, 0)
    if (!pearl) {
      throw Object.assign(new Error('Pearl not found'), { code: 'NOT_FOUND' })
    }
    if (pearl.ownerId !== requesterId) {
      throw Object.assign(new Error('Permission denied'), { code: 'FORBIDDEN' })
    }
    await this.pearlRepo.delete(id)
  }

  /**
   * 分享 Pearl 给好友
   * 验证顺序：owner check → shareability check → friendship check → 幂等检查
   */
  async share(pearlId: string, fromClawId: string, toClawId: string): Promise<void> {
    const pearl = await this.pearlRepo.findById(pearlId, 1)
    if (!pearl) {
      throw Object.assign(new Error('Pearl not found'), { code: 'NOT_FOUND' })
    }
    if (pearl.ownerId !== fromClawId) {
      throw Object.assign(new Error('Permission denied'), { code: 'FORBIDDEN' })
    }
    if (pearl.shareability === 'private') {
      throw Object.assign(new Error('Pearl is private'), { code: 'PRIVATE' })
    }

    // Verify friendship (both friends_only and public require friendship)
    const areFriends = await this.friendshipService.areFriends(fromClawId, toClawId)
    if (!areFriends) {
      throw Object.assign(new Error('Not friends'), { code: 'NOT_FRIENDS' })
    }

    // Phase 7: 信任阈值过滤（share_conditions.trustThreshold）
    if (this.trustService && pearl.shareConditions?.trustThreshold != null) {
      const domain = pearl.domainTags[0] ?? '_overall'
      const trustScore = await this.trustService.getComposite(fromClawId, toClawId, domain)
      if (trustScore < (pearl.shareConditions.trustThreshold as number)) {
        throw new TrustThresholdError(
          `Trust score ${trustScore.toFixed(2)} < required ${pearl.shareConditions.trustThreshold}`,
        )
      }
    }

    // Idempotent: createShare uses INSERT OR IGNORE (SQLite) / upsert ignoreDuplicates (Supabase)
    const alreadyShared = await this.pearlRepo.hasBeenSharedWith(pearlId, toClawId)
    if (alreadyShared) {
      return // Already shared, return success silently
    }

    await this.pearlRepo.createShare({
      id: randomUUID(),
      pearlId,
      fromClawId,
      toClawId,
    })

    this.eventBus.emit('pearl.shared', {
      fromClawId,
      toClawId,
      pearlId,
      domainTags: pearl.domainTags,
    })
  }

  /** 获取收到的 Pearl 列表 */
  async getReceivedPearls(
    clawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<
    Array<{ share: { id: string; fromClawId: string; createdAt: string }; pearl: PearlMetadataRecord }>
  > {
    return this.pearlRepo.getReceivedPearls(clawId, filters)
  }

  /**
   * 背书 Pearl
   * 验证：非自我背书，可见性检查
   */
  async endorse(
    pearlId: string,
    endorserClawId: string,
    score: number,
    comment?: string,
  ): Promise<PearlEndorsementRecord> {
    const pearl = await this.pearlRepo.findById(pearlId, 0)
    if (!pearl) {
      throw Object.assign(new Error('Pearl not found'), { code: 'NOT_FOUND' })
    }
    if (pearl.ownerId === endorserClawId) {
      throw Object.assign(new Error('Cannot endorse your own Pearl'), { code: 'SELF_ENDORSE' })
    }

    const visible = await this.pearlRepo.isVisibleTo(pearlId, endorserClawId)
    if (!visible) {
      throw Object.assign(new Error('Permission denied'), { code: 'FORBIDDEN' })
    }

    const endorsement = await this.endorsementRepo.upsert({
      id: randomUUID(),
      pearlId,
      endorserClawId,
      score,
      comment,
    })

    await this.updateLuster(pearlId)

    this.eventBus.emit('pearl.endorsed', {
      pearlId,
      endorserClawId,
      ownerId: pearl.ownerId,
      score,
      pearlDomainTags: pearl.domainTags,  // Phase 7: trust Q 维度更新需要领域信息
    })

    return endorsement
  }

  /** 重算 luster 并持久化（endorse 后自动调用） */
  async updateLuster(pearlId: string): Promise<void> {
    const scores = await this.endorsementRepo.getScores(pearlId)
    const luster = computeLuster(scores)
    await this.pearlRepo.updateLuster(pearlId, luster)
  }

  /** 检查 Pearl 是否对指定 claw 可见（用于 API 权限校验） */
  async isVisibleTo(pearlId: string, clawId: string): Promise<boolean> {
    return this.pearlRepo.isVisibleTo(pearlId, clawId)
  }

  /** 获取可路由候选集（Level 0，shareability != 'private'） */
  async getRoutingCandidates(clawId: string): Promise<PearlMetadataRecord[]> {
    return this.pearlRepo.getRoutingCandidates(clawId)
  }

  /** 获取指定用户 Pearl 的所有 domain_tags（用于心跳聚合） */
  async getPearlDomainTags(ownerId: string, since?: Date): Promise<string[]> {
    return this.pearlRepo.getPearlDomainTags(ownerId, since)
  }

  // ─── 纯函数直接暴露给外部（别名，便于测试）───
  readonly computeLuster = computeLuster

  // ─── pearl_references 管理 ───
  async addReference(
    pearlId: string,
    data: Omit<PearlReferenceRecord, 'id' | 'pearlId' | 'createdAt'>,
  ): Promise<PearlReferenceRecord> {
    return this.pearlRepo.addReference(pearlId, data)
  }

  async removeReference(referenceId: string): Promise<void> {
    return this.pearlRepo.removeReference(referenceId)
  }

  async getReferences(pearlId: string): Promise<PearlReferenceRecord[]> {
    return this.pearlRepo.getReferences(pearlId)
  }
}
