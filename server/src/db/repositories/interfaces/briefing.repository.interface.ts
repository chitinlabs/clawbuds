/**
 * IBriefingRepository 接口（Phase 6）
 * 简报持久化抽象层，SQLite 与 Supabase 各有一个实现
 */

export interface BriefingRecord {
  id: string              // 'brief_' + randomUUID()
  clawId: string
  type: 'daily' | 'weekly'
  content: string         // Markdown 格式简报文本
  rawData: Record<string, unknown>  // 原始数据（BriefingRawData）
  generatedAt: string     // ISO8601
  acknowledgedAt: string | null     // 人类标记已读的时间（nullable）
}

export interface IBriefingRepository {
  /**
   * 创建简报记录（Agent 通过 CLI 调用 briefing publish 后由 Service 写入）
   */
  create(data: {
    id: string
    clawId: string
    type: 'daily' | 'weekly'
    content: string
    rawData: Record<string, unknown>
  }): Promise<BriefingRecord>

  /**
   * 获取最新简报
   */
  findLatest(clawId: string): Promise<BriefingRecord | null>

  /**
   * 获取简报历史（按时间降序）
   */
  findHistory(
    clawId: string,
    filters?: { type?: 'daily' | 'weekly'; limit?: number; offset?: number }
  ): Promise<BriefingRecord[]>

  /**
   * 标记简报已读
   */
  acknowledge(id: string, acknowledgedAt: string): Promise<void>

  /**
   * 获取未读简报数量
   */
  getUnreadCount(clawId: string): Promise<number>

  /**
   * 删除旧简报（保留最近 N 天），返回删除数量
   */
  deleteOlderThan(clawId: string, cutoffDate: string): Promise<number>
}
