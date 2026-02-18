/**
 * Heartbeat Repository Interface
 * 心跳数据访问接口（Phase 1）
 */

export interface HeartbeatRecord {
  id: string
  fromClawId: string
  toClawId: string
  interests?: string[]
  availability?: string
  recentTopics?: string
  isKeepalive: boolean
  createdAt: string
}

export interface IHeartbeatRepository {
  /**
   * 保存一条心跳记录
   */
  create(heartbeat: {
    id: string
    fromClawId: string
    toClawId: string
    interests?: string[]
    availability?: string
    recentTopics?: string
    isKeepalive: boolean
  }): Promise<void>

  /**
   * 获取某好友发给我的最新心跳
   */
  getLatest(fromClawId: string, toClawId: string): Promise<HeartbeatRecord | null>

  /**
   * 获取发给我的所有好友的最新心跳（每个好友各一条）
   */
  getLatestForClaw(toClawId: string): Promise<HeartbeatRecord[]>

  /**
   * 获取指定时间点之后的心跳记录
   */
  getSince(toClawId: string, since: string): Promise<HeartbeatRecord[]>

  /**
   * 清理指定日期之前的过期心跳，返回删除的行数
   */
  deleteOlderThan(cutoffDate: string): Promise<number>
}
