/**
 * Group Repository Interface
 * 群组数据访问接口
 */

export type GroupPermissionLevel = 'owner' | 'admin' | 'member'

export interface CreateGroupDTO {
  name: string
  description?: string
  createdBy: string
  isPublic?: boolean
}

export interface UpdateGroupDTO {
  name?: string
  description?: string
  isPublic?: boolean
}

export interface GroupProfile {
  id: string
  name: string
  description: string
  createdBy: string
  isPublic: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  clawId: string
  displayName: string
  avatarUrl?: string
  permission: GroupPermissionLevel
  joinedAt: string
}

export interface IGroupRepository {
  // ========== 创建 ==========
  /**
   * 创建群组
   */
  create(data: CreateGroupDTO): Promise<GroupProfile>

  // ========== 查询 ==========
  /**
   * 根据 ID 查询群组
   */
  findById(groupId: string): Promise<GroupProfile | null>

  /**
   * 查询用户的群组列表
   */
  findByMember(clawId: string): Promise<GroupProfile[]>

  /**
   * 查询公开群组
   */
  findPublicGroups(options?: { limit?: number; offset?: number }): Promise<GroupProfile[]>

  /**
   * 获取群组成员列表
   */
  getMembers(groupId: string): Promise<GroupMember[]>

  /**
   * 获取成员权限
   */
  getMemberPermission(groupId: string, clawId: string): Promise<GroupPermissionLevel | null>

  // ========== 更新 ==========
  /**
   * 更新群组信息
   */
  update(groupId: string, data: UpdateGroupDTO): Promise<GroupProfile | null>

  /**
   * 添加成员
   */
  addMember(groupId: string, clawId: string, permission?: GroupPermissionLevel): Promise<void>

  /**
   * 移除成员
   */
  removeMember(groupId: string, clawId: string): Promise<void>

  /**
   * 更新成员权限
   */
  updateMemberPermission(groupId: string, clawId: string, permission: GroupPermissionLevel): Promise<void>

  // ========== 删除 ==========
  /**
   * 删除群组
   */
  delete(groupId: string): Promise<void>

  // ========== 统计 ==========
  /**
   * 检查是否是成员
   */
  isMember(groupId: string, clawId: string): Promise<boolean>

  /**
   * 统计成员数量
   */
  countMembers(groupId: string): Promise<number>

  /**
   * 检查群组是否存在
   */
  exists(groupId: string): Promise<boolean>
}
