import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { FriendInfo } from '../../../services/friendship.service.js'
import type { ICircleRepository, CircleProfile } from '../interfaces/circle.repository.interface.js'
import { CircleError } from '../interfaces/circle.repository.interface.js'

interface CircleRow {
  id: string
  owner_id: string
  name: string
  description: string
  created_at: string
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

export class SupabaseCircleRepository implements ICircleRepository {
  constructor(private supabase: SupabaseClient) {}

  async createCircle(ownerId: string, name: string, description?: string): Promise<CircleProfile> {
    const count = await this.countCircles(ownerId)
    if (count >= MAX_CIRCLES_PER_USER) {
      throw new CircleError('LIMIT_EXCEEDED', `Cannot create more than ${MAX_CIRCLES_PER_USER} circles`)
    }

    const id = randomUUID()
    const { data, error } = await this.supabase
      .from('circles')
      .insert({
        id,
        owner_id: ownerId,
        name,
        description: description ?? '',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new CircleError('DUPLICATE', `Circle "${name}" already exists`)
      }
      throw error
    }

    if (!data) {
      throw new Error('Failed to create circle: no data returned')
    }

    return rowToProfile(data as CircleRow)
  }

  async listCircles(ownerId: string): Promise<CircleProfile[]> {
    const { data, error } = await this.supabase
      .from('circles')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .throwOnError()

    if (error) {
      throw error
    }

    return (data as CircleRow[] || []).map(rowToProfile)
  }

  async deleteCircle(ownerId: string, circleId: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('circles')
      .delete({ count: 'exact' })
      .eq('id', circleId)
      .eq('owner_id', ownerId)
      .throwOnError()

    if (error) {
      throw error
    }

    if (count === 0) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }
  }

  async addFriendToCircle(circleId: string, friendClawId: string): Promise<void> {
    const { error } = await this.supabase
      .from('friend_circles')
      .insert({
        circle_id: circleId,
        friend_claw_id: friendClawId,
      })

    if (error) {
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new CircleError('DUPLICATE', 'Friend is already in this circle')
      }
      throw error
    }
  }

  async removeFriendFromCircle(circleId: string, friendClawId: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('friend_circles')
      .delete({ count: 'exact' })
      .eq('circle_id', circleId)
      .eq('friend_claw_id', friendClawId)
      .throwOnError()

    if (error) {
      throw error
    }

    if (count === 0) {
      throw new CircleError('NOT_FOUND', 'Friend not found in this circle')
    }
  }

  async getCircleMembers(ownerId: string, circleId: string): Promise<FriendInfo[]> {
    if (!await this.circleExists(circleId, ownerId)) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    // Get friend IDs from circle
    const { data: friendCircles, error: fcError } = await this.supabase
      .from('friend_circles')
      .select('friend_claw_id')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: true })
      .throwOnError()

    if (fcError) {
      throw fcError
    }

    if (!friendCircles || friendCircles.length === 0) {
      return []
    }

    const friendIds = friendCircles.map((fc: any) => fc.friend_claw_id)

    // Get claw info for these friends
    const { data: claws, error: clawError } = await this.supabase
      .from('claws')
      .select('claw_id, display_name, bio')
      .in('claw_id', friendIds)
      .throwOnError()

    if (clawError) {
      throw clawError
    }

    // Get friendship info for these friends
    const { data: friendships, error: friendshipError } = await this.supabase
      .from('friendships')
      .select('id, requester_id, accepter_id, accepted_at')
      .eq('status', 'accepted')
      .or(`and(requester_id.eq.${ownerId},accepter_id.in.(${friendIds.join(',')})),and(accepter_id.eq.${ownerId},requester_id.in.(${friendIds.join(',')}))`)
      .throwOnError()

    if (friendshipError) {
      throw friendshipError
    }

    // Build result by matching data
    const result: FriendInfo[] = []
    for (const friendId of friendIds) {
      const claw = claws?.find((c: any) => c.claw_id === friendId)
      const friendship = friendships?.find((f: any) =>
        (f.requester_id === ownerId && f.accepter_id === friendId) ||
        (f.accepter_id === ownerId && f.requester_id === friendId)
      )

      if (claw && friendship) {
        result.push({
          clawId: claw.claw_id,
          displayName: claw.display_name,
          bio: claw.bio,
          friendshipId: friendship.id,
          friendsSince: friendship.accepted_at,
        })
      }
    }

    return result
  }

  async getFriendIdsByCircles(ownerId: string, circleNames: string[]): Promise<string[]> {
    if (circleNames.length === 0) return []

    const { data, error } = await this.supabase
      .from('friend_circles')
      .select('friend_claw_id, circles!inner(owner_id, name)')
      .eq('circles.owner_id', ownerId)
      .in('circles.name', circleNames)
      .throwOnError()

    if (error) {
      throw error
    }

    // Get distinct friend IDs
    const friendIds = new Set((data || []).map((row: any) => row.friend_claw_id as string))
    return Array.from(friendIds)
  }

  async countCircles(ownerId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('circles')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .throwOnError()

    if (error) {
      throw error
    }

    return count ?? 0
  }

  async circleExists(circleId: string, ownerId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('circles')
      .select('*', { count: 'exact', head: true })
      .eq('id', circleId)
      .eq('owner_id', ownerId)
      .throwOnError()

    if (error) {
      throw error
    }

    return (count ?? 0) > 0
  }
}
