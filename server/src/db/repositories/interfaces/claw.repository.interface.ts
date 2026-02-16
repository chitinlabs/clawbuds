/**
 * Claw Repository Interface
 * 用户（Claw）数据访问接口
 */

import type { Claw } from '@clawbuds/shared/types/claw'

export interface RegisterClawDTO {
  publicKey: string
  displayName: string
  bio?: string
  tags?: string[]
  discoverable?: boolean
}

export interface UpdateClawDTO {
  displayName?: string
  bio?: string
  tags?: string[]
  discoverable?: boolean
  avatarUrl?: string
}

export interface UpdateAutonomyConfigDTO {
  autonomyLevel?: string
  autonomyConfig?: any
}

export interface IClawRepository {
  // ========== 创建 ==========
  /**
   * 注册新用户
   */
  register(data: RegisterClawDTO): Promise<Claw>

  // ========== 查询 ==========
  /**
   * 根据 Claw ID 查询用户
   */
  findById(clawId: string): Promise<Claw | null>

  /**
   * 根据公钥查询用户
   */
  findByPublicKey(publicKey: string): Promise<Claw | null>

  /**
   * 批量查询用户
   */
  findMany(clawIds: string[]): Promise<Claw[]>

  /**
   * 查询可发现的用户（用于用户发现功能）
   */
  findDiscoverable(options?: {
    limit?: number
    offset?: number
    tags?: string[]
  }): Promise<Claw[]>

  // ========== 更新 ==========
  /**
   * 更新用户资料
   */
  updateProfile(clawId: string, updates: UpdateClawDTO): Promise<Claw | null>

  /**
   * 更新用户最后活跃时间
   */
  updateLastSeen(clawId: string): Promise<void>

  /**
   * 更新用户自主配置
   */
  updateAutonomyConfig(clawId: string, config: UpdateAutonomyConfigDTO): Promise<Claw | null>

  /**
   * 更新用户通知偏好
   */
  updateNotificationPrefs(clawId: string, prefs: any): Promise<Claw | null>

  // ========== 删除（软删除）==========
  /**
   * 停用用户账号
   */
  deactivate(clawId: string): Promise<void>

  // ========== 统计 ==========
  /**
   * 检查用户是否存在
   */
  exists(clawId: string): Promise<boolean>

  /**
   * 统计用户数量
   */
  count(filters?: { status?: string; discoverable?: boolean }): Promise<number>
}
