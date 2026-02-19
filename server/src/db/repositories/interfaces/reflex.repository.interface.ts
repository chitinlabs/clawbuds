/**
 * ReflexEngine Repository Interfaces (Phase 4)
 * reflexes / reflex_executions 数据访问接口
 */

export type TriggerLayer = 0 | 1
export type ValueLayer = 'cognitive' | 'emotional' | 'expression' | 'collaboration' | 'infrastructure'
export type ReflexBehavior = 'keepalive' | 'sense' | 'route' | 'crystallize' | 'track' | 'collect' | 'alert' | 'audit'
export type ExecutionResult = 'executed' | 'recommended' | 'blocked' | 'queued_for_l1'
export type ReflexSource = 'builtin' | 'user' | 'micro_molt'

export interface ReflexRecord {
  id: string
  clawId: string
  name: string
  valueLayer: ValueLayer
  behavior: ReflexBehavior
  triggerLayer: TriggerLayer
  triggerConfig: Record<string, unknown>
  enabled: boolean
  confidence: number
  source: ReflexSource
  createdAt: string
  updatedAt: string
}

export interface ReflexExecutionRecord {
  id: string
  reflexId: string
  clawId: string
  eventType: string
  triggerData: Record<string, unknown>
  executionResult: ExecutionResult
  details: Record<string, unknown>
  createdAt: string
}

export interface IReflexRepository {
  /** 创建 Reflex 记录 */
  create(data: {
    id: string
    clawId: string
    name: string
    valueLayer: ValueLayer
    behavior: ReflexBehavior
    triggerLayer: TriggerLayer
    triggerConfig: Record<string, unknown>
    enabled: boolean
    confidence: number
    source: ReflexSource
  }): Promise<ReflexRecord>

  /** 按名称获取某 Claw 的 Reflex */
  findByName(clawId: string, name: string): Promise<ReflexRecord | null>

  /** 获取某 Claw 的所有已启用 Reflex */
  findEnabled(clawId: string, triggerLayer?: TriggerLayer): Promise<ReflexRecord[]>

  /** 获取某 Claw 的所有 Reflex（含禁用的） */
  findAll(clawId: string): Promise<ReflexRecord[]>

  /** 更新 Reflex 启用状态 */
  setEnabled(clawId: string, name: string, enabled: boolean): Promise<void>

  /** 更新 Reflex 置信度（Micro-Molt 使用） */
  updateConfidence(clawId: string, name: string, confidence: number): Promise<void>

  /** 更新 triggerConfig */
  updateConfig(clawId: string, name: string, config: Record<string, unknown>): Promise<void>

  /** 批量 upsert 内置 Reflex（系统初始化时调用） */
  upsertBuiltins(
    clawId: string,
    builtins: Array<Omit<ReflexRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void>
}

export interface IReflexExecutionRepository {
  /** 写入一条执行记录 */
  create(data: {
    id: string
    reflexId: string
    clawId: string
    eventType: string
    triggerData: Record<string, unknown>
    executionResult: ExecutionResult
    details: Record<string, unknown>
  }): Promise<ReflexExecutionRecord>

  /** 获取某 Claw 最近 N 条执行记录（按时间降序） */
  findRecent(clawId: string, limit: number): Promise<ReflexExecutionRecord[]>

  /** 获取指定结果类型的执行记录（用于 Micro-Molt 分析） */
  findByResult(
    clawId: string,
    result: ExecutionResult,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]>

  /** 获取指定 Reflex 的执行统计 */
  getStats(
    reflexId: string,
    since?: string,
  ): Promise<{
    total: number
    executed: number
    blocked: number
    queuedForL1: number
  }>

  /** 获取 alert 类型的执行记录（用于简报引擎收集） */
  findAlerts(
    clawId: string,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]>

  /** 删除旧记录（保留最近 N 天，默认 30 天） */
  deleteOlderThan(cutoffDate: string): Promise<number>
}
