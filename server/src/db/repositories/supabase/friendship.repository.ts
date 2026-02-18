/**
 * Supabase Friendship Repository Implementation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IFriendshipRepository,
  FriendshipStatus,
  FriendProfile,
  FriendRequest,
  FriendshipRecord,
} from '../interfaces/friendship.repository.interface.js'

export class SupabaseFriendshipRepository implements IFriendshipRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Validate that an ID contains only safe characters for PostgREST filter expressions.
   * Prevents injection into .or() filter strings.
   */
  private validateId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid ID format: ${id}`)
    }
  }

  /**
   * Escape an ID for use in PostgREST filter expressions.
   * Validates and returns the ID (safe characters only).
   */
  private escapeId(id: string): string {
    this.validateId(id)
    return id
  }

  // ========== 根据 ID 操作（用于向后兼容）==========

  async findById(friendshipId: string): Promise<FriendshipRecord | null> {
    const { data: row, error } = await this.supabase
      .from('friendships')
      .select('*')
      .eq('id', friendshipId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find friendship by ID: ${error.message}`)
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
    this.validateId(clawId1)
    this.validateId(clawId2)
    const { data: row, error } = await this.supabase
      .from('friendships')
      .select('*')
      .or(
        `and(requester_id.eq.${clawId1},accepter_id.eq.${clawId2}),and(requester_id.eq.${clawId2},accepter_id.eq.${clawId1})`,
      )
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to find friendship by claw IDs: ${error.message}`)
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
    const { error } = await this.supabase
      .from('friendships')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', friendshipId)

    if (error) {
      throw new Error(`Failed to accept friend request by ID: ${error.message}`)
    }
  }

  async rejectFriendRequestById(friendshipId: string): Promise<void> {
    const { error } = await this.supabase
      .from('friendships')
      .update({ status: 'rejected' })
      .eq('id', friendshipId)

    if (error) {
      throw new Error(`Failed to reject friend request by ID: ${error.message}`)
    }
  }

  async sendFriendRequest(fromClawId: string, toClawId: string): Promise<void> {
    const { error } = await this.supabase.from('friendships').insert({
      requester_id: fromClawId,
      accepter_id: toClawId,
      status: 'pending',
    })

    if (error) {
      if (error.code === '23503') {
        const fkError = new Error(`Failed to send friend request: ${error.message}`)
        ;(fkError as any).code = '23503'
        throw fkError
      }
      throw new Error(`Failed to send friend request: ${error.message}`)
    }
  }

  async acceptFriendRequest(clawId: string, friendId: string): Promise<void> {
    this.validateId(clawId)
    this.validateId(friendId)
    const { error } = await this.supabase
      .from('friendships')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .or(
        `and(requester_id.eq.${friendId},accepter_id.eq.${clawId}),and(requester_id.eq.${clawId},accepter_id.eq.${friendId})`,
      )

    if (error) {
      throw new Error(`Failed to accept friend request: ${error.message}`)
    }
  }

  async rejectFriendRequest(clawId: string, friendId: string): Promise<void> {
    this.validateId(clawId)
    this.validateId(friendId)
    const { error } = await this.supabase
      .from('friendships')
      .update({ status: 'rejected' })
      .or(
        `and(requester_id.eq.${friendId},accepter_id.eq.${clawId}),and(requester_id.eq.${clawId},accepter_id.eq.${friendId})`,
      )

    if (error) {
      throw new Error(`Failed to reject friend request: ${error.message}`)
    }
  }

  async areFriends(clawId: string, friendId: string): Promise<boolean> {
    this.validateId(clawId)
    this.validateId(friendId)
    const { count, error } = await this.supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${clawId},accepter_id.eq.${friendId}),and(requester_id.eq.${friendId},accepter_id.eq.${clawId})`,
      )

    if (error) {
      throw new Error(`Failed to check friendship: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  async listFriends(clawId: string): Promise<FriendProfile[]> {
    // Use FK hints with aliases to disambiguate requester/accepter
    const { data: friendships, error } = await this.supabase
      .from('friendships')
      .select(`
        id, requester_id, accepter_id, status, created_at, accepted_at,
        requester:claws!friendships_requester_id_fkey(claw_id, display_name, bio, avatar_url),
        accepter:claws!friendships_accepter_id_fkey(claw_id, display_name, bio, avatar_url)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${this.escapeId(clawId)},accepter_id.eq.${this.escapeId(clawId)}`)
      .order('accepted_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list friends: ${error.message}`)
    }

    // Pick the other person's info (not the current user)
    return (friendships || []).map((f: any) => {
      const friendClaw = f.requester_id === clawId ? f.accepter : f.requester
      return {
        clawId: friendClaw.claw_id,
        displayName: friendClaw.display_name,
        bio: friendClaw.bio,
        avatarUrl: friendClaw.avatar_url ?? undefined,
        status: f.status,
        createdAt: f.created_at,
        friendshipId: f.id,
        friendsSince: f.accepted_at,
      }
    })
  }

  async listPendingRequests(clawId: string): Promise<FriendRequest[]> {
    const { data: rows, error } = await this.supabase
      .from('friendships')
      .select('*')
      .eq('accepter_id', clawId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list pending requests: ${error.message}`)
    }

    return (rows || []).map((row) => ({
      fromClawId: row.requester_id,
      toClawId: row.accepter_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }))
  }

  async listSentRequests(clawId: string): Promise<FriendRequest[]> {
    const { data: rows, error } = await this.supabase
      .from('friendships')
      .select('*')
      .eq('requester_id', clawId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to list sent requests: ${error.message}`)
    }

    return (rows || []).map((row) => ({
      fromClawId: row.requester_id,
      toClawId: row.accepter_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }))
  }

  async getFriendshipStatus(
    clawId: string,
    friendId: string,
  ): Promise<FriendshipStatus | null> {
    this.validateId(clawId)
    this.validateId(friendId)
    const { data: row, error } = await this.supabase
      .from('friendships')
      .select('status')
      .or(
        `and(requester_id.eq.${clawId},accepter_id.eq.${friendId}),and(requester_id.eq.${friendId},accepter_id.eq.${clawId})`,
      )
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to get friendship status: ${error.message}`)
    }

    return row?.status ?? null
  }

  async removeFriend(clawId: string, friendId: string): Promise<void> {
    this.validateId(clawId)
    this.validateId(friendId)
    const { error } = await this.supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${clawId},accepter_id.eq.${friendId}),and(requester_id.eq.${friendId},accepter_id.eq.${clawId})`,
      )

    if (error) {
      throw new Error(`Failed to remove friend: ${error.message}`)
    }
  }

  async blockUser(clawId: string, blockedId: string): Promise<void> {
    // 先删除现有关系
    await this.removeFriend(clawId, blockedId)

    // 创建阻止关系
    const { error } = await this.supabase.from('friendships').insert({
      requester_id: clawId,
      accepter_id: blockedId,
      status: 'blocked',
    })

    if (error) {
      throw new Error(`Failed to block user: ${error.message}`)
    }
  }

  async unblockUser(clawId: string, blockedId: string): Promise<void> {
    const { error } = await this.supabase
      .from('friendships')
      .delete()
      .eq('requester_id', clawId)
      .eq('accepter_id', blockedId)
      .eq('status', 'blocked')

    if (error) {
      throw new Error(`Failed to unblock user: ${error.message}`)
    }
  }

  async countFriends(clawId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .or(`requester_id.eq.${this.escapeId(clawId)},accepter_id.eq.${this.escapeId(clawId)}`)
      .eq('status', 'accepted')

    if (error) {
      throw new Error(`Failed to count friends: ${error.message}`)
    }

    return count ?? 0
  }

  async countPendingRequests(clawId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('accepter_id', clawId)
      .eq('status', 'pending')

    if (error) {
      throw new Error(`Failed to count pending requests: ${error.message}`)
    }

    return count ?? 0
  }
}
