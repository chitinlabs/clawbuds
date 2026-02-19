/**
 * Pearl Repository Interfaces (Phase 3)
 * 处理 pearls / pearl_references / pearl_endorsements / pearl_shares 数据访问
 */

export type PearlType = 'insight' | 'framework' | 'experience'
export type PearlShareability = 'private' | 'friends_only' | 'public'
export type PearlOriginType = 'manual' | 'conversation' | 'observation'

/** Level 0: Metadata（列表展示、路由候选筛选） */
export interface PearlMetadataRecord {
  id: string
  ownerId: string
  type: PearlType
  triggerText: string
  domainTags: string[]
  luster: number
  shareability: PearlShareability
  shareConditions: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/** Level 1: Content（完整阅读，含 Level 0） */
export interface PearlContentRecord extends PearlMetadataRecord {
  body: string | null
  context: string | null
  originType: PearlOriginType
}

/** pearl_references 记录 */
export interface PearlReferenceRecord {
  id: string
  pearlId: string
  type: 'source' | 'related_pearl'
  content: string
  createdAt: string
}

/** Level 2: Full（含引用，含 Level 1） */
export interface PearlFullRecord extends PearlContentRecord {
  references: PearlReferenceRecord[]
}

/** pearl_endorsements 记录 */
export interface PearlEndorsementRecord {
  id: string
  pearlId: string
  endorserClawId: string
  score: number
  comment: string | null
  createdAt: string
  updatedAt: string
}

/** 查询过滤条件 */
export interface PearlFilters {
  type?: PearlType
  domain?: string          // 过滤 domain_tags 包含此值的 Pearl
  shareability?: PearlShareability
  since?: string           // ISO8601，只返回此时间之后创建的
  limit?: number
  offset?: number
}

/** 创建 Pearl 所需数据 */
export interface CreatePearlData {
  id: string
  ownerId: string
  type: PearlType
  triggerText: string
  domainTags: string[]
  shareability: PearlShareability
  shareConditions: Record<string, unknown> | null
  body: string | null
  context: string | null
  originType: PearlOriginType
}

/** 可更新的 Pearl 字段 */
export interface UpdatePearlData {
  triggerText?: string
  body?: string | null
  context?: string | null
  domainTags?: string[]
  shareability?: PearlShareability
  shareConditions?: Record<string, unknown> | null
}

/**
 * Pearl Repository Interface
 * 处理 pearls + pearl_references + pearl_shares 三张表
 */
export interface IPearlRepository {
  /** 创建 Pearl（Level 1 记录） */
  create(data: CreatePearlData): Promise<PearlContentRecord>

  /** 按级别查询单条 Pearl */
  findById(
    id: string,
    level: 0 | 1 | 2,
  ): Promise<PearlMetadataRecord | PearlContentRecord | PearlFullRecord | null>

  /** 查询指定用户的所有 Pearl（Level 0，支持过滤） */
  findByOwner(ownerId: string, filters?: PearlFilters): Promise<PearlMetadataRecord[]>

  /** 更新 Pearl（只允许 owner 更新，由 Service 层保障） */
  update(id: string, data: UpdatePearlData): Promise<PearlContentRecord>

  /** 更新 luster 值 */
  updateLuster(id: string, luster: number): Promise<void>

  /** 删除 Pearl（级联删除 references / endorsements / shares） */
  delete(id: string): Promise<void>

  /** 获取指定用户所有 Pearl 的 domain_tags（用于心跳聚合） */
  getPearlDomainTags(ownerId: string, since?: Date): Promise<string[]>

  /** 获取可路由候选集（shareability != 'private'，Level 0） */
  getRoutingCandidates(ownerId: string): Promise<PearlMetadataRecord[]>

  /** 检查 Pearl 是否对指定 claw 可见（用于背书权限验证） */
  isVisibleTo(pearlId: string, clawId: string): Promise<boolean>

  // pearl_references 管理（Level 2）
  addReference(
    pearlId: string,
    data: Omit<PearlReferenceRecord, 'id' | 'pearlId' | 'createdAt'>,
  ): Promise<PearlReferenceRecord>
  removeReference(referenceId: string): Promise<void>
  getReferences(pearlId: string): Promise<PearlReferenceRecord[]>

  // pearl_shares 管理
  createShare(data: {
    id: string
    pearlId: string
    fromClawId: string
    toClawId: string
  }): Promise<void>
  getReceivedPearls(
    toClawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      share: { id: string; fromClawId: string; createdAt: string }
      pearl: PearlMetadataRecord
    }>
  >
  hasBeenSharedWith(pearlId: string, toClawId: string): Promise<boolean>
}

/**
 * Pearl Endorsement Repository Interface
 */
export interface IPearlEndorsementRepository {
  /** 创建或更新背书（幂等：相同 pearl_id + endorser_claw_id 则更新） */
  upsert(data: {
    id: string
    pearlId: string
    endorserClawId: string
    score: number
    comment?: string
  }): Promise<PearlEndorsementRecord>

  /** 获取指定 Pearl 的所有背书 */
  findByPearl(pearlId: string): Promise<PearlEndorsementRecord[]>

  /** 获取指定背书方对某 Pearl 的背书（存在性检查） */
  findOne(pearlId: string, endorserClawId: string): Promise<PearlEndorsementRecord | null>

  /** 获取所有背书分数（只返回 score 数组，用于 computeLuster） */
  getScores(pearlId: string): Promise<number[]>
}
