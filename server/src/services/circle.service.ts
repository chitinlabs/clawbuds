import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { FriendshipService, FriendInfo } from './friendship.service.js'

interface CircleRow {
  id: string
  owner_id: string
  name: string
  description: string
  created_at: string
}

export interface CircleProfile {
  id: string
  ownerId: string
  name: string
  description: string
  createdAt: string
}

function rowToProfile(row: CircleRow): CircleProfile {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  }
}

const MAX_CIRCLES_PER_USER = 50

export class CircleService {
  constructor(
    private db: Database.Database,
    private friendshipService: FriendshipService,
  ) {}

  createCircle(ownerId: string, name: string, description?: string): CircleProfile {
    const count = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM circles WHERE owner_id = ?')
      .get(ownerId) as { cnt: number }
    if (count.cnt >= MAX_CIRCLES_PER_USER) {
      throw new CircleError('LIMIT_EXCEEDED', `Cannot create more than ${MAX_CIRCLES_PER_USER} circles`)
    }

    const id = randomUUID()
    try {
      const row = this.db
        .prepare(
          'INSERT INTO circles (id, owner_id, name, description) VALUES (?, ?, ?, ?) RETURNING *',
        )
        .get(id, ownerId, name, description ?? '') as CircleRow
      return rowToProfile(row)
    } catch (err) {
      if ((err as Error).message?.includes('UNIQUE constraint failed')) {
        throw new CircleError('DUPLICATE', `Circle "${name}" already exists`)
      }
      throw err
    }
  }

  listCircles(ownerId: string): CircleProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM circles WHERE owner_id = ? ORDER BY created_at ASC')
      .all(ownerId) as CircleRow[]
    return rows.map(rowToProfile)
  }

  deleteCircle(ownerId: string, circleId: string): void {
    const result = this.db
      .prepare('DELETE FROM circles WHERE id = ? AND owner_id = ?')
      .run(circleId, ownerId)
    if (result.changes === 0) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }
  }

  addFriendToCircle(ownerId: string, circleId: string, friendClawId: string): void {
    const circle = this.db
      .prepare('SELECT 1 FROM circles WHERE id = ? AND owner_id = ?')
      .get(circleId, ownerId)
    if (!circle) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    if (!this.friendshipService.areFriends(ownerId, friendClawId)) {
      throw new CircleError('NOT_FRIENDS', 'Can only add friends to a circle')
    }

    try {
      this.db
        .prepare('INSERT INTO friend_circles (circle_id, friend_claw_id) VALUES (?, ?)')
        .run(circleId, friendClawId)
    } catch (err) {
      if ((err as Error).message?.includes('UNIQUE constraint failed') ||
          (err as Error).message?.includes('PRIMARY KEY constraint failed')) {
        throw new CircleError('DUPLICATE', 'Friend is already in this circle')
      }
      throw err
    }
  }

  removeFriendFromCircle(ownerId: string, circleId: string, friendClawId: string): void {
    const circle = this.db
      .prepare('SELECT 1 FROM circles WHERE id = ? AND owner_id = ?')
      .get(circleId, ownerId)
    if (!circle) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    const result = this.db
      .prepare('DELETE FROM friend_circles WHERE circle_id = ? AND friend_claw_id = ?')
      .run(circleId, friendClawId)
    if (result.changes === 0) {
      throw new CircleError('NOT_FOUND', 'Friend not found in this circle')
    }
  }

  getCircleMembers(ownerId: string, circleId: string): FriendInfo[] {
    const circle = this.db
      .prepare('SELECT 1 FROM circles WHERE id = ? AND owner_id = ?')
      .get(circleId, ownerId)
    if (!circle) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    const rows = this.db
      .prepare(
        `SELECT
           c.claw_id, c.display_name, c.bio,
           f.id AS friendship_id, f.accepted_at AS friends_since
         FROM friend_circles fl
         JOIN claws c ON c.claw_id = fl.friend_claw_id
         JOIN friendships f ON f.status = 'accepted'
           AND ((f.requester_id = ? AND f.accepter_id = fl.friend_claw_id)
             OR (f.requester_id = fl.friend_claw_id AND f.accepter_id = ?))
         WHERE fl.circle_id = ?
         ORDER BY fl.created_at ASC`,
      )
      .all(ownerId, ownerId, circleId) as Array<{
      claw_id: string
      display_name: string
      bio: string
      friendship_id: string
      friends_since: string
    }>

    return rows.map((r) => ({
      clawId: r.claw_id,
      displayName: r.display_name,
      bio: r.bio,
      friendshipId: r.friendship_id,
      friendsSince: r.friends_since,
    }))
  }

  getFriendIdsByCircles(ownerId: string, circleNames: string[]): string[] {
    if (circleNames.length === 0) return []

    const placeholders = circleNames.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT DISTINCT fl.friend_claw_id
         FROM friend_circles fl
         JOIN circles l ON l.id = fl.circle_id
         WHERE l.owner_id = ? AND l.name IN (${placeholders})`,
      )
      .all(ownerId, ...circleNames) as Array<{ friend_claw_id: string }>

    return rows.map((r) => r.friend_claw_id)
  }
}

export class CircleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CircleError'
  }
}
