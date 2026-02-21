/**
 * RelationshipService
 * 关系强度衰减 + Dunbar 层级分类（Phase 1）
 */

import type { IRelationshipStrengthRepository, RelationshipStrengthRecord, DunbarLayer } from '../db/repositories/interfaces/relationship-strength.repository.interface.js'
import type { EventBus } from './event-bus.js'

export type InteractionType = 'message' | 'reaction' | 'heartbeat' | 'pearl_share' | 'poll_vote'

// ─────────────────────────────────────────────
// Boost 权重配置（可通过环境变量覆盖）
// ─────────────────────────────────────────────
const BOOST_WEIGHTS: Record<InteractionType, number> = {
  message: 0.05,
  reaction: 0.02,
  heartbeat: 0.005,
  pearl_share: 0.08,
  poll_vote: 0.03,
}

// 单日单好友 boost 累加上限
const DAILY_BOOST_CAP = parseFloat(process.env.CLAWBUDS_BOOST_DAILY_CAP ?? '0.15')

// Dunbar 层级强度阈值（用于 reclassifyLayers）
const LAYER_THRESHOLDS: Record<DunbarLayer, number> = {
  core: 0.8,
  sympathy: 0.6,
  active: 0.3,
  casual: 0.0,
}

// Dunbar 层级人数上限（按层扣除前一层）
const LAYER_SIZE_LIMITS: Record<DunbarLayer, number> = {
  core: 5,
  sympathy: 15,
  active: 50,
  casual: Infinity,
}

export interface LayerChange {
  friendId: string
  oldLayer: DunbarLayer
  newLayer: DunbarLayer
  strength: number
}

export interface AtRiskRelationship {
  friendId: string
  strength: number
  currentLayer: DunbarLayer
  nextLayerThreshold: number
  daysSinceLastInteraction: number
  manualOverride: boolean
}

/**
 * 分段线性衰减率函数（纯函数，可单独测试）
 * s ∈ [0, 0.3):    decay = 0.95 + s * 0.1
 * s ∈ [0.3, 0.6):  decay = 0.98 + (s - 0.3) * 0.05
 * s ∈ [0.6, 0.8):  decay = 0.995 + (s - 0.6) * 0.02
 * s ∈ [0.8, 1.0]:  decay = 0.999
 */
export function computeDecayRate(strength: number): number {
  if (strength < 0.3) {
    return 0.95 + strength * 0.1
  } else if (strength < 0.6) {
    return 0.98 + (strength - 0.3) * 0.05
  } else if (strength < 0.8) {
    return 0.995 + (strength - 0.6) * 0.02
  } else {
    return 0.999
  }
}

// ─────────────────────────────────────────────
// 日 boost 追踪（内存 Map，重启后清零）
// 格式: `${clawId}:${friendId}:${dateStr}` → accumulated boost
// ─────────────────────────────────────────────
const dailyBoostTracker = new Map<string, number>()

function getDailyBoostKey(clawId: string, friendId: string): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${clawId}:${friendId}:${date}`
}

export class RelationshipService {
  constructor(
    private rsRepo: IRelationshipStrengthRepository,
    private eventBus: EventBus,
  ) {}

  async getStrength(clawId: string, friendId: string): Promise<number> {
    const record = await this.rsRepo.get(clawId, friendId)
    return record?.strength ?? 0
  }

  async getRelationship(clawId: string, friendId: string): Promise<RelationshipStrengthRecord | null> {
    return this.rsRepo.get(clawId, friendId)
  }

  computeDecayRate(strength: number): number {
    return computeDecayRate(strength)
  }

  /**
   * 互动提振：增加 boost，但受日上限约束
   */
  async boostStrength(clawId: string, friendId: string, interactionType: InteractionType): Promise<void> {
    const record = await this.rsRepo.get(clawId, friendId)
    if (!record) return

    const weight = BOOST_WEIGHTS[interactionType] ?? 0
    if (weight === 0) return

    const key = getDailyBoostKey(clawId, friendId)
    const accumulated = dailyBoostTracker.get(key) ?? 0

    const available = Math.max(0, DAILY_BOOST_CAP - accumulated)
    const actualBoost = Math.min(weight, available)

    if (actualBoost <= 0) return

    const newStrength = Math.min(1.0, record.strength * computeDecayRate(record.strength) + actualBoost)
    dailyBoostTracker.set(key, accumulated + actualBoost)

    await this.rsRepo.updateStrength(clawId, friendId, newStrength)
    await this.rsRepo.touchInteraction(clawId, friendId)
  }

  /**
   * 每日全量衰减 + 层级重算
   */
  async decayAll(): Promise<void> {
    await this.rsRepo.decayAll(computeDecayRate)

    // T11: 使用 findAllOwners() 获取全部有关系记录的 clawId，逐个重算 Dunbar 层级
    // 每轮独立 try/catch，单个 claw 失败不影响其余处理
    const allClawIds = await this.rsRepo.findAllOwners()
    for (const clawId of allClawIds) {
      try {
        await this.reclassifyLayers(clawId)
      } catch (err) {
        // 记录错误但继续处理其余 clawId
        console.error(`[RelationshipService] reclassifyLayers failed for ${clawId}:`, err)
      }
    }
  }

  /**
   * 重新计算某 Claw 所有好友的 Dunbar 层级（按 strength 排名 + 阈值双重限制）
   */
  async reclassifyLayers(clawId: string): Promise<LayerChange[]> {
    const records = await this.rsRepo.getAllForClaw(clawId) // sorted by strength DESC
    const changes: LayerChange[] = []

    // 按层级顺序分配（已扣除前层名额）
    const layerOrder: DunbarLayer[] = ['core', 'sympathy', 'active', 'casual']
    const layerCounts: Record<string, number> = { core: 0, sympathy: 0, active: 0, casual: 0 }

    for (const record of records) {
      // manual_override 的记录跳过
      if (record.manualOverride) continue

      let assignedLayer: DunbarLayer = 'casual'

      for (const layer of layerOrder) {
        const threshold = LAYER_THRESHOLDS[layer]
        const limit = LAYER_SIZE_LIMITS[layer]
        if (record.strength >= threshold && layerCounts[layer] < limit) {
          assignedLayer = layer
          break
        }
      }

      layerCounts[assignedLayer]++

      if (assignedLayer !== record.dunbarLayer) {
        changes.push({
          friendId: record.friendId,
          oldLayer: record.dunbarLayer,
          newLayer: assignedLayer,
          strength: record.strength,
        })
        await this.rsRepo.updateLayer(clawId, record.friendId, assignedLayer, false)

        this.eventBus.emit('relationship.layer_changed', {
          clawId,
          friendId: record.friendId,
          oldLayer: record.dunbarLayer,
          newLayer: assignedLayer,
          strength: record.strength,
        })
      }
    }

    return changes
  }

  /**
   * 获取 at-risk 关系
   */
  async getAtRiskRelationships(clawId: string): Promise<AtRiskRelationship[]> {
    const margin = parseFloat(process.env.CLAWBUDS_ATRISK_MARGIN ?? '0.05')
    const inactiveDays = parseInt(process.env.CLAWBUDS_ATRISK_INACTIVE_DAYS ?? '7')

    const records = await this.rsRepo.getAtRisk(clawId, margin, inactiveDays)

    return records.map((record) => {
      const threshold = LAYER_THRESHOLDS[record.dunbarLayer]
      const daysSince = record.lastInteractionAt
        ? Math.floor((Date.now() - new Date(record.lastInteractionAt).getTime()) / 86400000)
        : inactiveDays + 1

      return {
        friendId: record.friendId,
        strength: record.strength,
        currentLayer: record.dunbarLayer,
        nextLayerThreshold: threshold,
        daysSinceLastInteraction: daysSince,
        manualOverride: record.manualOverride,
      }
    })
  }

  /**
   * 手动设置好友层级（设置 manual_override = true）
   */
  async setManualLayer(clawId: string, friendId: string, layer: DunbarLayer): Promise<void> {
    await this.rsRepo.updateLayer(clawId, friendId, layer, true)
  }

  /**
   * 好友关系建立时初始化（strength=0.5, layer=casual）
   */
  async initializeRelationship(clawId: string, friendId: string): Promise<void> {
    const existing = await this.rsRepo.get(clawId, friendId)
    if (existing) return

    await this.rsRepo.create({
      clawId,
      friendId,
      strength: 0.5,
      dunbarLayer: 'casual',
    })
  }

  /**
   * 好友关系解除时清理
   */
  async removeRelationship(clawId: string, friendId: string): Promise<void> {
    await this.rsRepo.delete(clawId, friendId)
  }

  /**
   * 获取某 Claw 的好友列表（按层级分组）
   */
  async getFriendsByLayer(clawId: string): Promise<Record<DunbarLayer, RelationshipStrengthRecord[]>> {
    const records = await this.rsRepo.getAllForClaw(clawId)
    const result: Record<DunbarLayer, RelationshipStrengthRecord[]> = {
      core: [],
      sympathy: [],
      active: [],
      casual: [],
    }
    for (const record of records) {
      result[record.dunbarLayer].push(record)
    }
    return result
  }
}
