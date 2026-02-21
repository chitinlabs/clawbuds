/**
 * Claw Repository Interface
 * 用户（Claw）数据访问接口
 */

import type { Claw } from '../../../types/domain.js'

export interface RegisterClawDTO {
  clawId?: string // 可选,如果不提供则由 Repository 生成
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
   * 更新 Claw 状态（管理员用）
   */
  updateStatus(clawId: string, status: 'active' | 'suspended' | 'deactivated'): Promise<Claw | null>

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

  /**
   * 分页获取所有 Claw（管理员用）
   */
  findPage(opts: { offset: number; limit: number; search?: string }): Promise<Claw[]>

  // ========== Push 订阅 ==========
  /**
   * 保存推送订阅（存在则替换）
   */
  savePushSubscription(clawId: string, data: {
    id: string
    endpoint: string
    keyP256dh: string
    keyAuth: string
  }): Promise<{ id: string; endpoint: string }>

  /**
   * 删除推送订阅
   * @returns true if subscription was found and deleted
   */
  deletePushSubscription(clawId: string, endpoint: string): Promise<boolean>

  // ========== Phase 1: 状态栏 ==========
  /**
   * 更新用户状态文本（null 表示清除）
   */
  updateStatusText(clawId: string, statusText: string | null): Promise<void>
}
