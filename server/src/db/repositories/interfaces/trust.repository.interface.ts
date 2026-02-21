/**
 * Trust Repository Interface (Phase 7)
 * 五维信任模型：Q（代理互动）、H（人类背书）、N（网络位置）、W（见证信誉）、composite（合成分）
 */

/** Q 维度更新信号 */
export type TrustSignal =
  | 'pearl_endorsed_high'  // Pearl 被背书（score > 0.7）→ Q +0.05
  | 'pearl_endorsed_low'   // Pearl 被背书（score < 0.3）→ Q -0.02
  | 'groom_replied'        // 梳理消息被回复 → Q +0.03
  | 'groom_ignored'        // 梳理消息被忽略（> 7天）→ Q -0.02
  | 'pearl_reshared'       // Pearl 被二次分享 → Q +0.08

/** 信任评分记录 */
export interface TrustScoreRecord {
  id: string
  fromClawId: string
  toClawId: string
  domain: string           // '_overall' 或具体领域如 'AI'
  qScore: number           // [0, 1]: 代理互动质量（自动更新）
  hScore: number | null    // [0, 1] | null: 人类背书（null = 未背书，区别于 0 = 主动低信任）
  nScore: number           // [0, 1]: 网络位置分
  wScore: number           // [0, 1]: 见证信誉分
  composite: number        // [0, 1]: 加权合成分
  updatedAt: string
}

/** 合成分计算权重 */
export const TRUST_WEIGHTS = {
  q: 0.25,  // 代理互动质量
  h: 0.40,  // 人类背书（权重最高）
  n: 0.20,  // 网络位置
  w: 0.15,  // 见证信誉
} as const

/** Q 维度信号 → delta 映射 */
export const Q_SIGNAL_DELTAS: Record<TrustSignal, number> = {
  pearl_endorsed_high: +0.05,
  pearl_reshared: +0.08,
  groom_replied: +0.03,
  pearl_endorsed_low: -0.02,
  groom_ignored: -0.02,
}

/** 月衰减率（Q 维度，H 不衰减） */
export const TRUST_MONTHLY_DECAY = 0.99

/** W 维度间接信任传递衰减系数 */
export const TRUST_W_DAMPENING = 0.5

/** Dunbar 层级对应的 N 维度分值 */
export const DUNBAR_LAYER_SCORES: Record<string, number> = {
  core: 1.0,
  sympathy: 0.75,
  active: 0.5,
  casual: 0.25,
}

export interface ITrustRepository {
  /**
   * 获取信任评分（指定领域）
   * 如果无该领域的记录，返回 null（调用方可回退到 _overall）
   */
  get(fromClawId: string, toClawId: string, domain: string): Promise<TrustScoreRecord | null>

  /**
   * 获取某好友所有领域的信任评分
   */
  getAllDomains(fromClawId: string, toClawId: string): Promise<TrustScoreRecord[]>

  /**
   * 获取 from 对所有好友的信任评分（按 composite 降序）
   */
  getAllForClaw(fromClawId: string, domain?: string): Promise<TrustScoreRecord[]>

  /**
   * 创建或更新信任评分记录（upsert）
   */
  upsert(data: {
    fromClawId: string
    toClawId: string
    domain: string
    qScore?: number
    hScore?: number | null
    nScore?: number
    wScore?: number
    composite?: number
  }): Promise<TrustScoreRecord>

  /**
   * 更新 Q 维度分（带 delta，自动 clamp 到 [0, 1]）
   */
  updateQScore(fromClawId: string, toClawId: string, domain: string, delta: number): Promise<void>

  /**
   * 更新 H 维度分（null = 清除背书）
   */
  updateHScore(
    fromClawId: string,
    toClawId: string,
    domain: string,
    score: number | null,
  ): Promise<void>

  /**
   * 更新 N 维度分
   */
  updateNScore(fromClawId: string, toClawId: string, domain: string, score: number): Promise<void>

  /**
   * 更新 W 维度分
   */
  updateWScore(fromClawId: string, toClawId: string, domain: string, score: number): Promise<void>

  /**
   * 更新合成分（在各维度更新后调用）
   */
  updateComposite(
    fromClawId: string,
    toClawId: string,
    domain: string,
    composite: number,
  ): Promise<void>

  /**
   * Q 维度每月衰减
   * @param decayRate 衰减率（0-1 之间，如 0.99）
   * @param fromClawId 可选：只衰减特定用户的记录
   * @returns 受影响的记录数
   */
  decayAllQ(decayRate: number, fromClawId?: string): Promise<number>

  /**
   * 初始化好友信任记录（好友关系建立时，_overall 域）
   */
  initialize(fromClawId: string, toClawId: string): Promise<void>

  /**
   * 删除好友信任记录（好友关系解除时）
   */
  delete(fromClawId: string, toClawId: string): Promise<void>

  /**
   * 获取对某好友信任度最高的领域（Pearl 路由时使用）
   */
  getTopDomains(fromClawId: string, toClawId: string, limit?: number): Promise<TrustScoreRecord[]>
}
