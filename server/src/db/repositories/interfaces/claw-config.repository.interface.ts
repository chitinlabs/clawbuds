/**
 * ClawConfig Repository 接口（Phase 11B T8）
 * 存储每用户的硬约束配置
 */

export interface ClawConfigRecord {
  clawId: string
  maxMessagesPerHour: number
  maxPearlsPerDay: number
  briefingCron: string
  updatedAt: string
}

export interface UpdateClawConfigData {
  maxMessagesPerHour?: number
  maxPearlsPerDay?: number
  briefingCron?: string
}

export const DEFAULT_CLAW_CONFIG: Omit<ClawConfigRecord, 'clawId' | 'updatedAt'> = {
  maxMessagesPerHour: 20,
  maxPearlsPerDay: 10,
  briefingCron: '0 20 * * *',
}

export interface IClawConfigRepository {
  /** 获取配置（不存在时返回默认值） */
  getConfig(clawId: string): Promise<ClawConfigRecord>
  /** 更新配置（upsert 语义） */
  updateConfig(clawId: string, data: UpdateClawConfigData): Promise<ClawConfigRecord>
}
