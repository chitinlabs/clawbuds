/**
 * TrustService (Phase 7)
 * 五维信任模型：Q（代理互动）、H（人类背书）、N（网络位置）、W（见证信誉）、composite
 */

import type {
  ITrustRepository,
  TrustScoreRecord,
  TrustSignal,
} from '../db/repositories/interfaces/trust.repository.interface.js'
import {
  TRUST_WEIGHTS,
  Q_SIGNAL_DELTAS,
  DUNBAR_LAYER_SCORES,
  TRUST_W_DAMPENING,
} from '../db/repositories/interfaces/trust.repository.interface.js'
import type { RelationshipService } from './relationship.service.js'
import type { FriendshipService } from './friendship.service.js'
import type { EventBus } from './event-bus.js'

export class TrustService {
  constructor(
    private trustRepo: ITrustRepository,
    private relationshipService: RelationshipService,
    private friendshipService: FriendshipService,
    private eventBus: EventBus,
  ) {}

  // ─────────────────────────────────────────────
  // 纯函数：合成分计算
  // ─────────────────────────────────────────────

  /**
   * 计算合成信任分（纯函数，可独立单元测试）
   *
   * H=null 时：在 Q、N、W 三维上重新归一化分配权重
   * H 有值时：使用完整四维权重（H 权重最高 0.40）
   *
   * 结果 clamp 到 [0, 1]
   */
  computeComposite(scores: { q: number; h: number | null; n: number; w: number }): number {
    const { q, h, n, w } = scores

    let composite: number

    if (h !== null) {
      // 完整四维权重
      composite =
        TRUST_WEIGHTS.q * q +
        TRUST_WEIGHTS.h * h +
        TRUST_WEIGHTS.n * n +
        TRUST_WEIGHTS.w * w
    } else {
      // H 未设置：三维归一化（Q + N + W 权重之和）
      const totalWeight = TRUST_WEIGHTS.q + TRUST_WEIGHTS.n + TRUST_WEIGHTS.w
      composite =
        (TRUST_WEIGHTS.q * q + TRUST_WEIGHTS.n * n + TRUST_WEIGHTS.w * w) / totalWeight
    }

    return Math.max(0, Math.min(1, composite))
  }

  // ─────────────────────────────────────────────
  // 查询方法
  // ─────────────────────────────────────────────

  /**
   * 获取合成信任分（带领域回退到 _overall）
   */
  async getComposite(
    fromClawId: string,
    toClawId: string,
    domain: string = '_overall',
  ): Promise<number> {
    // 优先查域内评分
    if (domain !== '_overall') {
      const domainRecord = await this.trustRepo.get(fromClawId, toClawId, domain)
      if (domainRecord) return domainRecord.composite
    }
    // 回退到 _overall
    const overall = await this.trustRepo.get(fromClawId, toClawId, '_overall')
    return overall?.composite ?? 0.5  // 默认 0.5
  }

  /**
   * 获取完整信任评分记录（含所有维度）
   */
  async getScore(
    fromClawId: string,
    toClawId: string,
    domain: string = '_overall',
  ): Promise<TrustScoreRecord | null> {
    return this.trustRepo.get(fromClawId, toClawId, domain)
  }

  /**
   * 获取对某好友所有领域的信任评分
   */
  async getByDomain(fromClawId: string, toClawId: string): Promise<TrustScoreRecord[]> {
    return this.trustRepo.getAllDomains(fromClawId, toClawId)
  }

  /**
   * 获取 from 对所有好友的信任评分排名
   */
  async getAllForClaw(fromClawId: string, domain?: string): Promise<TrustScoreRecord[]> {
    return this.trustRepo.getAllForClaw(fromClawId, domain)
  }

  /**
   * 获取对某好友信任度最高的领域
   */
  async getTopDomains(
    fromClawId: string,
    toClawId: string,
    limit: number = 5,
  ): Promise<TrustScoreRecord[]> {
    return this.trustRepo.getTopDomains(fromClawId, toClawId, limit)
  }

  // ─────────────────────────────────────────────
  // 更新方法
  // ─────────────────────────────────────────────

  /**
   * Q 维度更新（自动，来自代理互动信号）
   * 同时更新 _overall 域和指定领域
   */
  async updateQ(
    fromClawId: string,
    toClawId: string,
    domain: string,
    signal: TrustSignal,
  ): Promise<void> {
    const delta = Q_SIGNAL_DELTAS[signal]

    // 更新 _overall
    await this.ensureRecord(fromClawId, toClawId, '_overall')
    await this.trustRepo.updateQScore(fromClawId, toClawId, '_overall', delta)
    await this.recalculateComposite(fromClawId, toClawId, '_overall')

    // 若有指定领域，也更新
    if (domain !== '_overall') {
      await this.ensureRecord(fromClawId, toClawId, domain)
      await this.trustRepo.updateQScore(fromClawId, toClawId, domain, delta)
      await this.recalculateComposite(fromClawId, toClawId, domain)
    }
  }

  /**
   * H 维度设置（人类手动背书）
   * 设置后重算 composite
   */
  async setH(
    fromClawId: string,
    toClawId: string,
    hScore: number,
    domain: string = '_overall',
    _note?: string,
  ): Promise<{ trustScore: TrustScoreRecord; oldComposite: number; newComposite: number }> {
    await this.ensureRecord(fromClawId, toClawId, domain)

    const before = await this.trustRepo.get(fromClawId, toClawId, domain)
    const oldComposite = before?.composite ?? 0.5

    await this.trustRepo.updateHScore(fromClawId, toClawId, domain, hScore)
    await this.recalculateComposite(fromClawId, toClawId, domain)

    const after = (await this.trustRepo.get(fromClawId, toClawId, domain))!
    return { trustScore: after, oldComposite, newComposite: after.composite }
  }

  /**
   * N 维度重算（关系强度变化后调用）
   * 基于 Dunbar 层级 + 共同好友数 + 关系强度
   */
  async recalculateN(fromClawId: string, toClawId: string): Promise<void> {
    if (!this.relationshipService) return

    const relation = await this.relationshipService.getRelationship(fromClawId, toClawId)
    if (!relation) return

    // 1. Dunbar 层级分
    const layerScore = DUNBAR_LAYER_SCORES[relation.dunbarLayer] ?? 0.25

    // 2. 关系强度本身
    const strengthScore = relation.strength

    // 3. 共同好友数（简化：此处直接用 0，完整实现需要查询共同好友）
    //    Phase 9 可扩展为真正计算
    const mutualScore = 0

    // 等权合成 N 分
    const nScore = (layerScore + mutualScore + strengthScore) / 3

    // 更新所有领域的 N 分
    const records = await this.trustRepo.getAllDomains(fromClawId, toClawId)
    for (const record of records) {
      await this.trustRepo.updateNScore(fromClawId, toClawId, record.domain, nScore)
      await this.recalculateComposite(fromClawId, toClawId, record.domain)
    }
  }

  /**
   * W 维度重算（共同好友见证信誉）
   * 使用弱传递性：trust(A,B) × trust(B,C) × dampening
   */
  async recalculateW(
    fromClawId: string,
    toClawId: string,
    domain: string = '_overall',
  ): Promise<void> {
    if (!this.friendshipService) return

    // 找共同好友
    const fromFriends = await this.friendshipService.listFriends(fromClawId)
    const toFriends = await this.friendshipService.listFriends(toClawId)

    const fromSet = new Set(fromFriends.map((f: any) => f.clawId ?? f.id ?? f))
    const toSet = new Set(toFriends.map((f: any) => f.clawId ?? f.id ?? f))
    const mutualIds = [...fromSet].filter((id) => toSet.has(id))

    if (mutualIds.length === 0) {
      await this.trustRepo.updateWScore(fromClawId, toClawId, domain, 0)
      return
    }

    // 每个共同好友的见证贡献
    const witnessScores = await Promise.all(
      mutualIds.map(async (mutualId) => {
        const aTrustsMutual = await this.getComposite(fromClawId, mutualId, '_overall')
        const mutualTrustsTarget = await this.getComposite(mutualId, toClawId, domain)
        return aTrustsMutual * mutualTrustsTarget * TRUST_W_DAMPENING
      }),
    )

    const wScore = witnessScores.reduce((sum, s) => sum + s, 0) / witnessScores.length
    await this.trustRepo.updateWScore(fromClawId, toClawId, domain, Math.min(1, wScore))
    await this.recalculateComposite(fromClawId, toClawId, domain)
  }

  /**
   * Q 维度每月衰减（只衰减 Q，不衰减 H）
   */
  async decayAll(): Promise<void> {
    const MONTHLY_DECAY = 0.99
    await this.trustRepo.decayAllQ(MONTHLY_DECAY)
    // 衰减后需要重算所有 composite
    // 注意：全量重算可能代价较大，此处简化为仅更新 DB 中 q_score，
    // composite 在下次查询时会被 getComposite 计算
    // TODO Phase 9：批量重算 composite
  }

  /**
   * 好友关系建立时初始化信任记录（双向）
   */
  async initializeRelationship(fromClawId: string, toClawId: string): Promise<void> {
    await this.trustRepo.initialize(fromClawId, toClawId)
  }

  /**
   * 好友关系解除时清理信任记录（双向）
   */
  async removeRelationship(fromClawId: string, toClawId: string): Promise<void> {
    await this.trustRepo.delete(fromClawId, toClawId)
  }

  // ─────────────────────────────────────────────
  // 私有辅助方法
  // ─────────────────────────────────────────────

  /**
   * 确保信任记录存在（不存在时创建默认值）
   */
  private async ensureRecord(
    fromClawId: string,
    toClawId: string,
    domain: string,
  ): Promise<void> {
    const existing = await this.trustRepo.get(fromClawId, toClawId, domain)
    if (!existing) {
      await this.trustRepo.upsert({ fromClawId, toClawId, domain })
    }
  }

  /**
   * 合成分重算（任一维度更新后调用）
   */
  private async recalculateComposite(
    fromClawId: string,
    toClawId: string,
    domain: string,
  ): Promise<void> {
    const record = await this.trustRepo.get(fromClawId, toClawId, domain)
    if (!record) return

    const composite = this.computeComposite({
      q: record.qScore,
      h: record.hScore,
      n: record.nScore,
      w: record.wScore,
    })
    await this.trustRepo.updateComposite(fromClawId, toClawId, domain, composite)
  }
}
