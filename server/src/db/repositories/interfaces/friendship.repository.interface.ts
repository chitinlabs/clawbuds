/**
 * Friendship Repository Interface
 * 好友关系数据访问接口
 */

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

export interface FriendProfile {
  clawId: string
  displayName: string
  bio: string
  avatarUrl?: string
  status: FriendshipStatus
  createdAt: string
}

export interface FriendRequest {
  fromClawId: string
  toClawId: string
  status: FriendshipStatus
  createdAt: string
  updatedAt: string
}

export interface IFriendshipRepository {
  // ========== 创建 ==========
  /**
   * 发送好友请求
   */
  sendFriendRequest(fromClawId: string, toClawId: string): Promise<void>

  /**
   * 接受好友请求
   */
  acceptFriendRequest(clawId: string, friendId: string): Promise<void>

  /**
   * 拒绝好友请求
   */
  rejectFriendRequest(clawId: string, friendId: string): Promise<void>

  // ========== 查询 ==========
  /**
   * 检查是否是好友
   */
  areFriends(clawId: string, friendId: string): Promise<boolean>

  /**
   * 获取好友列表
   */
  listFriends(clawId: string): Promise<FriendProfile[]>

  /**
   * 获取待处理的好友请求
   */
  listPendingRequests(clawId: string): Promise<FriendRequest[]>

  /**
   * 获取已发送的好友请求
   */
  listSentRequests(clawId: string): Promise<FriendRequest[]>

  /**
   * 获取好友关系状态
   */
  getFriendshipStatus(clawId: string, friendId: string): Promise<FriendshipStatus | null>

  // ========== 删除 ==========
  /**
   * 移除好友
   */
  removeFriend(clawId: string, friendId: string): Promise<void>

  /**
   * 屏蔽用户
   */
  blockUser(clawId: string, blockedId: string): Promise<void>

  /**
   * 取消屏蔽
   */
  unblockUser(clawId: string, blockedId: string): Promise<void>

  // ========== 统计 ==========
  /**
   * 统计好友数量
   */
  countFriends(clawId: string): Promise<number>

  /**
   * 统计待处理请求数量
   */
  countPendingRequests(clawId: string): Promise<number>
}
