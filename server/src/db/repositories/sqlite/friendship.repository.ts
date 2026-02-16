/**
 * SQLite Friendship Repository Implementation
 * 基于 better-sqlite3 的好友关系数据访问实现
 */

import type Database from 'better-sqlite3'
import type {
  IFriendshipRepository,
  FriendshipStatus,
  FriendProfile,
  FriendRequest,
  FriendshipRecord,
} from '../interfaces/friendship.repository.interface.js'
import { randomUUID } from 'node:crypto'

interface FriendshipRow {
  id: string
  requester_id: string
  accepter_id: string
  status: FriendshipStatus
  created_at: string
  accepted_at: string | null
}

export class SQLiteFriendshipRepository implements IFriendshipRepository {
  constructor(private db: Database.Database) {}

  // ========== 根据 ID 操作（用于向后兼容）==========

  async findById(friendshipId: string): Promise<FriendshipRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM friendships WHERE id = ?')
      .get(friendshipId) as FriendshipRow | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      requesterId: row.requester_id,
      accepterId: row.accepter_id,
      status: row.status,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
    }
  }

  async findByClawIds(clawId1: string, clawId2: string): Promise<FriendshipRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM friendships
         WHERE (requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?)
         LIMIT 1`,
      )
      .get(clawId1, clawId2, clawId2, clawId1) as FriendshipRow | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      requesterId: row.requester_id,
      accepterId: row.accepter_id,
      status: row.status,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
    }
  }

  async acceptFriendRequestById(friendshipId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE friendships
         SET status = 'accepted', accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .run(friendshipId)
  }

  async rejectFriendRequestById(friendshipId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE friendships
         SET status = 'rejected'
         WHERE id = ?`,
      )
      .run(friendshipId)
  }

  // ========== 创建 ==========

  async sendFriendRequest(fromClawId: string, toClawId: string): Promise<void> {
    const friendshipId = randomUUID()

    this.db
      .prepare(
        `INSERT INTO friendships (id, requester_id, accepter_id, status)
         VALUES (?, ?, ?, 'pending')`,
      )
      .run(friendshipId, fromClawId, toClawId)
  }

  async acceptFriendRequest(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE friendships
         SET status = 'accepted', accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE (requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?)`,
      )
      .run(friendId, clawId, clawId, friendId)
  }

  async rejectFriendRequest(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE friendships
         SET status = 'rejected'
         WHERE (requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?)`,
      )
      .run(friendId, clawId, clawId, friendId)
  }

  // ========== 查询 ==========

  async areFriends(clawId: string, friendId: string): Promise<boolean> {
    const result = this.db
      .prepare(
        `SELECT 1 FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?))
         LIMIT 1`,
      )
      .get(clawId, friendId, friendId, clawId)

    return result !== undefined
  }

  async listFriends(clawId: string): Promise<FriendProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT c.claw_id, c.display_name, c.bio, c.avatar_url, f.status, f.created_at,
                f.id as friendship_id, f.accepted_at as friends_since
         FROM friendships f
         JOIN claws c ON (
           CASE
             WHEN f.requester_id = ? THEN c.claw_id = f.accepter_id
             ELSE c.claw_id = f.requester_id
           END
         )
         WHERE (f.requester_id = ? OR f.accepter_id = ?)
           AND f.status = 'accepted'
         ORDER BY f.accepted_at DESC`,
      )
      .all(clawId, clawId, clawId) as Array<{
      claw_id: string
      display_name: string
      bio: string
      avatar_url: string | null
      status: FriendshipStatus
      created_at: string
      friendship_id: string
      friends_since: string
    }>

    return rows.map((row) => ({
      clawId: row.claw_id,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      friendshipId: row.friendship_id,
      friendsSince: row.friends_since,
    }))
  }

  async listPendingRequests(clawId: string): Promise<FriendRequest[]> {
    const rows = this.db
      .prepare(
        `SELECT requester_id as fromClawId, accepter_id as toClawId, status, created_at, created_at as updatedAt
         FROM friendships
         WHERE accepter_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
      )
      .all(clawId) as Array<{
      fromClawId: string
      toClawId: string
      status: FriendshipStatus
      created_at: string
      updatedAt: string
    }>

    return rows.map((row) => ({
      fromClawId: row.fromClawId,
      toClawId: row.toClawId,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updatedAt,
    }))
  }

  async listSentRequests(clawId: string): Promise<FriendRequest[]> {
    const rows = this.db
      .prepare(
        `SELECT requester_id as fromClawId, accepter_id as toClawId, status, created_at, created_at as updatedAt
         FROM friendships
         WHERE requester_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
      )
      .all(clawId) as Array<{
      fromClawId: string
      toClawId: string
      status: FriendshipStatus
      created_at: string
      updatedAt: string
    }>

    return rows.map((row) => ({
      fromClawId: row.fromClawId,
      toClawId: row.toClawId,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updatedAt,
    }))
  }

  async getFriendshipStatus(
    clawId: string,
    friendId: string,
  ): Promise<FriendshipStatus | null> {
    const row = this.db
      .prepare(
        `SELECT status FROM friendships
         WHERE (requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?)
         LIMIT 1`,
      )
      .get(clawId, friendId, friendId, clawId) as { status: FriendshipStatus } | undefined

    return row ? row.status : null
  }

  // ========== 删除 ==========

  async removeFriend(clawId: string, friendId: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM friendships
         WHERE (requester_id = ? AND accepter_id = ?)
            OR (requester_id = ? AND accepter_id = ?)`,
      )
      .run(clawId, friendId, friendId, clawId)
  }

  async blockUser(clawId: string, blockedId: string): Promise<void> {
    const friendshipId = randomUUID()

    // 删除现有的好友关系
    await this.removeFriend(clawId, blockedId)

    // 创建阻止关系
    this.db
      .prepare(
        `INSERT INTO friendships (id, requester_id, accepter_id, status)
         VALUES (?, ?, ?, 'blocked')`,
      )
      .run(friendshipId, clawId, blockedId)
  }

  async unblockUser(clawId: string, blockedId: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM friendships
         WHERE requester_id = ? AND accepter_id = ? AND status = 'blocked'`,
      )
      .run(clawId, blockedId)
  }

  // ========== 统计 ==========

  async countFriends(clawId: string): Promise<number> {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM friendships
         WHERE (requester_id = ? OR accepter_id = ?)
           AND status = 'accepted'`,
      )
      .get(clawId, clawId) as { count: number }

    return result.count
  }

  async countPendingRequests(clawId: string): Promise<number> {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM friendships
         WHERE accepter_id = ? AND status = 'pending'`,
      )
      .get(clawId) as { count: number }

    return result.count
  }
}
