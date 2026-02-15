import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { EventBus } from './event-bus.js'

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked'

interface FriendshipRow {
  id: string
  requester_id: string
  accepter_id: string
  status: FriendshipStatus
  created_at: string
  accepted_at: string | null
}

export interface FriendshipProfile {
  id: string
  requesterId: string
  accepterId: string
  status: FriendshipStatus
  createdAt: string
  acceptedAt: string | null
}

function rowToProfile(row: FriendshipRow): FriendshipProfile {
  return {
    id: row.id,
    requesterId: row.requester_id,
    accepterId: row.accepter_id,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }
}

export interface FriendInfo {
  clawId: string
  displayName: string
  bio: string
  friendshipId: string
  friendsSince: string
}

export class FriendshipService {
  constructor(
    private db: Database.Database,
    private eventBus?: EventBus,
  ) {}

  sendRequest(requesterId: string, accepterId: string): FriendshipProfile {
    if (requesterId === accepterId) {
      throw new FriendshipError('SELF_REQUEST', 'Cannot send friend request to yourself')
    }

    const result = this.db.transaction(() => {
      // Check if accepter exists
      const accepterExists = this.db
        .prepare('SELECT 1 FROM claws WHERE claw_id = ? AND status = ?')
        .get(accepterId, 'active')
      if (!accepterExists) {
        throw new FriendshipError('CLAW_NOT_FOUND', 'Target claw not found')
      }

      // Check for existing friendship in either direction
      const existing = this.db
        .prepare(
          `SELECT * FROM friendships
           WHERE (requester_id = ? AND accepter_id = ?)
              OR (requester_id = ? AND accepter_id = ?)`,
        )
        .get(requesterId, accepterId, accepterId, requesterId) as FriendshipRow | undefined

      if (existing) {
        if (existing.status === 'accepted') {
          throw new FriendshipError('ALREADY_FRIENDS', 'Already friends')
        }
        if (existing.status === 'pending') {
          if (existing.requester_id === accepterId) {
            // Auto-accept: the other person already sent us a request
            return { profile: this._doAccept(existing.id), autoAccepted: true }
          }
          throw new FriendshipError('DUPLICATE_REQUEST', 'Friend request already sent')
        }
        if (existing.status === 'blocked') {
          throw new FriendshipError('BLOCKED', 'Cannot send friend request')
        }
        // If rejected, allow re-requesting by updating the existing row
        if (existing.status === 'rejected') {
          const row = this.db
            .prepare(
              `UPDATE friendships SET requester_id = ?, accepter_id = ?, status = 'pending',
               accepted_at = NULL, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ? RETURNING *`,
            )
            .get(requesterId, accepterId, existing.id) as FriendshipRow
          return { profile: rowToProfile(row), autoAccepted: false }
        }
      }

      const id = randomUUID()
      const row = this.db
        .prepare(
          'INSERT INTO friendships (id, requester_id, accepter_id) VALUES (?, ?, ?) RETURNING *',
        )
        .get(id, requesterId, accepterId) as FriendshipRow
      return { profile: rowToProfile(row), autoAccepted: false }
    })()

    // Emit events after transaction commits
    if (result.autoAccepted) {
      this.eventBus?.emit('friend.accepted', {
        recipientIds: [result.profile.requesterId, result.profile.accepterId],
        friendship: result.profile,
      })
    } else {
      this.eventBus?.emit('friend.request', {
        recipientId: accepterId,
        friendship: result.profile,
      })
    }

    return result.profile
  }

  getPendingRequests(clawId: string): FriendshipProfile[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM friendships
         WHERE accepter_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
      )
      .all(clawId) as FriendshipRow[]
    return rows.map(rowToProfile)
  }

  acceptRequest(clawId: string, friendshipId: string): FriendshipProfile {
    const result = this.db.transaction(() => {
      const friendship = this.findById(friendshipId)
      if (!friendship) {
        throw new FriendshipError('NOT_FOUND', 'Friend request not found')
      }
      if (friendship.accepterId !== clawId) {
        throw new FriendshipError('NOT_AUTHORIZED', 'Only the recipient can accept this request')
      }
      if (friendship.status !== 'pending') {
        throw new FriendshipError('INVALID_STATUS', 'Request is not pending')
      }
      return this._doAccept(friendshipId)
    })()

    this.eventBus?.emit('friend.accepted', {
      recipientIds: [result.requesterId, result.accepterId],
      friendship: result,
    })

    return result
  }

  rejectRequest(clawId: string, friendshipId: string): FriendshipProfile {
    return this.db.transaction(() => {
      const friendship = this.findById(friendshipId)
      if (!friendship) {
        throw new FriendshipError('NOT_FOUND', 'Friend request not found')
      }
      if (friendship.accepterId !== clawId) {
        throw new FriendshipError('NOT_AUTHORIZED', 'Only the recipient can reject this request')
      }
      if (friendship.status !== 'pending') {
        throw new FriendshipError('INVALID_STATUS', 'Request is not pending')
      }

      const row = this.db
        .prepare("UPDATE friendships SET status = 'rejected' WHERE id = ? RETURNING *")
        .get(friendshipId) as FriendshipRow
      return rowToProfile(row)
    })()
  }

  removeFriend(clawId: string, friendClawId: string): void {
    const result = this.db
      .prepare(
        `DELETE FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND accepter_id = ?)
             OR (requester_id = ? AND accepter_id = ?))`,
      )
      .run(clawId, friendClawId, friendClawId, clawId)

    if (result.changes === 0) {
      throw new FriendshipError('NOT_FOUND', 'Friendship not found')
    }
  }

  listFriends(clawId: string): FriendInfo[] {
    const rows = this.db
      .prepare(
        `SELECT
           f.id AS friendship_id,
           f.accepted_at AS friends_since,
           c.claw_id,
           c.display_name,
           c.bio
         FROM friendships f
         JOIN claws c ON c.claw_id = CASE
           WHEN f.requester_id = ? THEN f.accepter_id
           ELSE f.requester_id
         END
         WHERE f.status = 'accepted'
           AND (f.requester_id = ? OR f.accepter_id = ?)
         ORDER BY f.accepted_at DESC`,
      )
      .all(clawId, clawId, clawId) as Array<{
      friendship_id: string
      friends_since: string
      claw_id: string
      display_name: string
      bio: string
    }>

    return rows.map((r) => ({
      clawId: r.claw_id,
      displayName: r.display_name,
      bio: r.bio,
      friendshipId: r.friendship_id,
      friendsSince: r.friends_since,
    }))
  }

  findById(id: string): FriendshipProfile | null {
    const row = this.db.prepare('SELECT * FROM friendships WHERE id = ?').get(id) as
      | FriendshipRow
      | undefined
    return row ? rowToProfile(row) : null
  }

  areFriends(clawId1: string, clawId2: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND accepter_id = ?)
             OR (requester_id = ? AND accepter_id = ?))`,
      )
      .get(clawId1, clawId2, clawId2, clawId1)
    return !!row
  }

  private _doAccept(friendshipId: string): FriendshipProfile {
    const row = this.db
      .prepare(
        `UPDATE friendships SET status = 'accepted',
         accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(friendshipId) as FriendshipRow
    return rowToProfile(row)
  }
}

export class FriendshipError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FriendshipError'
  }
}
