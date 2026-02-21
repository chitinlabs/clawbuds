/**
 * ICarapaceHistoryRepository — carapace.md 版本历史接口（Phase 10）
 * 记录每次 carapace.md 修改前的旧版本快照，支持历史查询和回滚
 */

export type CarapaceChangeReason = 'micro_molt' | 'manual_edit' | 'allow' | 'escalate' | 'restore'

/** 运行时枚举常量（用于 CHECK 约束验证和序列化） */
export const CARAPACE_CHANGE_REASONS: CarapaceChangeReason[] = [
  'micro_molt',
  'manual_edit',
  'allow',
  'escalate',
  'restore',
]

export interface CarapaceHistoryRecord {
  id: string
  clawId: string
  version: number              // 自增版本号（每个 claw 独立计数）
  content: string              // carapace.md 全文快照
  changeReason: CarapaceChangeReason
  suggestedBy: 'system' | 'user'
  createdAt: string
}

export interface ICarapaceHistoryRepository {
  /**
   * 创建版本记录（在写入新 carapace.md 前调用）
   */
  create(data: {
    id: string
    clawId: string
    content: string
    changeReason: CarapaceChangeReason
    suggestedBy: 'system' | 'user'
  }): Promise<CarapaceHistoryRecord>

  /**
   * 获取最新版本号（用于生成下一个版本号）
   * 若无历史记录，返回 0
   */
  getLatestVersion(clawId: string): Promise<number>

  /**
   * 获取历史列表（按版本降序）
   */
  findByOwner(
    clawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<CarapaceHistoryRecord[]>

  /**
   * 获取指定版本
   */
  findByVersion(clawId: string, version: number): Promise<CarapaceHistoryRecord | null>

  /**
   * 删除旧记录（保留最近 keepCount 个版本）
   * @returns 删除的记录数
   */
  pruneOldVersions(clawId: string, keepCount: number): Promise<number>
}
