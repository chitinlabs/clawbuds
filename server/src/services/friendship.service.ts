import type { EventBus } from './event-bus.js'
import type {
  IFriendshipRepository,
  FriendshipRecord,
} from '../db/repositories/interfaces/friendship.repository.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import { config } from '../config/env.js'

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked'

export interface FriendshipProfile {
  id: string
  requesterId: string
  accepterId: string
  status: FriendshipStatus
  createdAt: string
  acceptedAt: string | null
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
    private friendshipRepository: IFriendshipRepository,
    private eventBus?: EventBus,
    private cache?: ICacheService,
  ) {}

  async sendRequest(requesterId: string, accepterId: string): Promise<FriendshipProfile> {
    if (requesterId === accepterId) {
      throw new FriendshipError('SELF_REQUEST', 'Cannot send friend request to yourself')
    }

    // Check existing friendship status
    const existingStatus = await this.friendshipRepository.getFriendshipStatus(
      requesterId,
      accepterId,
    )

    if (existingStatus === 'accepted') {
      throw new FriendshipError('ALREADY_FRIENDS', 'Already friends')
    }

    if (existingStatus === 'blocked') {
      throw new FriendshipError('BLOCKED', 'Cannot send friend request')
    }

    // If pending, check if it's a reverse request (auto-accept scenario)
    if (existingStatus === 'pending') {
      const existingFriendship = await this._findByClawIds(requesterId, accepterId)
      if (existingFriendship) {
        // Check if the existing request is in the reverse direction (accepter -> requester)
        // If Bob already sent to Alice, and now Alice sends to Bob, auto-accept
        if (existingFriendship.accepterId === requesterId) {
          // This is a reverse request - auto accept
          await this.friendshipRepository.acceptFriendRequestById(existingFriendship.id)
          const accepted = await this._findByClawIds(requesterId, accepterId)
          if (!accepted) {
            throw new Error('Failed to auto-accept friendship')
          }
          return this._toProfile(accepted)
        } else {
          // Same direction request - duplicate
          throw new FriendshipError('DUPLICATE_REQUEST', 'Friend request already sent')
        }
      }
    }

    // If previously rejected, remove the old record to allow re-request
    if (existingStatus === 'rejected') {
      await this.friendshipRepository.removeFriend(requesterId, accepterId)
    }

    // Send friend request
    try {
      await this.friendshipRepository.sendFriendRequest(requesterId, accepterId)
    } catch (err: any) {
      // Handle foreign key constraint (claw doesn't exist)
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || err.code === '23503') {
        throw new FriendshipError('CLAW_NOT_FOUND', 'User not found')
      }
      throw err
    }

    // Get the created friendship record
    const friendship = await this._findByClawIds(requesterId, accepterId)
    if (!friendship) {
      throw new Error('Failed to create friendship request')
    }

    await this.invalidateFriendCache(requesterId, accepterId)

    // Emit event
    this.eventBus?.emit('friend.request', {
      recipientId: accepterId,
      friendship: this._toProfile(friendship),
    })

    return this._toProfile(friendship)
  }

  async getPendingRequests(clawId: string): Promise<FriendshipProfile[]> {
    const requests = await this.friendshipRepository.listPendingRequests(clawId)
    const profiles: FriendshipProfile[] = []

    for (const request of requests) {
      const friendship = await this._findByClawIds(request.fromClawId, request.toClawId)
      if (friendship) {
        profiles.push(this._toProfile(friendship))
      }
    }

    return profiles
  }

  async acceptRequest(clawId: string, friendshipId: string): Promise<FriendshipProfile> {
    const friendship = await this.friendshipRepository.findById(friendshipId)
    if (!friendship) {
      throw new FriendshipError('NOT_FOUND', 'Friend request not found')
    }

    if (friendship.accepterId !== clawId) {
      throw new FriendshipError('NOT_AUTHORIZED', 'Only the recipient can accept this request')
    }

    if (friendship.status !== 'pending') {
      throw new FriendshipError('INVALID_STATUS', 'Request is not pending')
    }

    await this.friendshipRepository.acceptFriendRequestById(friendshipId)

    const updated = await this.friendshipRepository.findById(friendshipId)
    if (!updated) {
      throw new Error('Failed to accept friendship request')
    }

    const profile = this._toProfile(updated)

    await this.invalidateFriendCache(profile.requesterId, profile.accepterId)

    this.eventBus?.emit('friend.accepted', {
      recipientIds: [profile.requesterId, profile.accepterId],
      friendship: profile,
    })

    return profile
  }

  async rejectRequest(clawId: string, friendshipId: string): Promise<FriendshipProfile> {
    const friendship = await this.friendshipRepository.findById(friendshipId)
    if (!friendship) {
      throw new FriendshipError('NOT_FOUND', 'Friend request not found')
    }

    if (friendship.accepterId !== clawId) {
      throw new FriendshipError('NOT_AUTHORIZED', 'Only the recipient can reject this request')
    }

    if (friendship.status !== 'pending') {
      throw new FriendshipError('INVALID_STATUS', 'Request is not pending')
    }

    await this.friendshipRepository.rejectFriendRequestById(friendshipId)

    const updated = await this.friendshipRepository.findById(friendshipId)
    if (!updated) {
      throw new Error('Failed to reject friendship request')
    }

    await this.invalidateFriendCache(updated.requesterId, updated.accepterId)

    return this._toProfile(updated)
  }

  async removeFriend(clawId: string, friendClawId: string): Promise<void> {
    const areFriends = await this.friendshipRepository.areFriends(clawId, friendClawId)
    if (!areFriends) {
      throw new FriendshipError('NOT_FOUND', 'Friendship not found')
    }

    await this.friendshipRepository.removeFriend(clawId, friendClawId)
    await this.invalidateFriendCache(clawId, friendClawId)

    this.eventBus?.emit('friend.removed', { clawId, friendId: friendClawId })
  }

  async listFriends(clawId: string): Promise<FriendInfo[]> {
    const cacheKey = `friends:${clawId}`
    if (this.cache) {
      const cached = await this.cache.get<FriendInfo[]>(cacheKey)
      if (cached) return cached
    }

    const friends = await this.friendshipRepository.listFriends(clawId)

    const result = friends.map((friend) => ({
      clawId: friend.clawId,
      displayName: friend.displayName,
      bio: friend.bio,
      friendshipId: friend.friendshipId || '',
      friendsSince: friend.friendsSince || friend.createdAt,
    }))

    if (this.cache) {
      await this.cache.set(cacheKey, result, config.cacheTtlFriend)
    }
    return result
  }

  async findById(id: string): Promise<FriendshipProfile | null> {
    const friendship = await this.friendshipRepository.findById(id)
    return friendship ? this._toProfile(friendship) : null
  }

  async areFriends(clawId1: string, clawId2: string): Promise<boolean> {
    const sorted = [clawId1, clawId2].sort()
    const cacheKey = `areFriends:${sorted[0]}:${sorted[1]}`
    if (this.cache) {
      const cached = await this.cache.get<boolean>(cacheKey)
      if (cached !== null && cached !== undefined) return cached
    }

    const result = await this.friendshipRepository.areFriends(clawId1, clawId2)

    if (this.cache) {
      await this.cache.set(cacheKey, result, config.cacheTtlFriend)
    }
    return result
  }

  private async invalidateFriendCache(clawId1: string, clawId2: string): Promise<void> {
    if (!this.cache) return
    const sorted = [clawId1, clawId2].sort()
    await Promise.all([
      this.cache.del(`friends:${clawId1}`),
      this.cache.del(`friends:${clawId2}`),
      this.cache.del(`areFriends:${sorted[0]}:${sorted[1]}`),
    ])
  }

  // ========== 私有辅助方法 ==========

  private _toProfile(record: FriendshipRecord): FriendshipProfile {
    return {
      id: record.id,
      requesterId: record.requesterId,
      accepterId: record.accepterId,
      status: record.status,
      createdAt: record.createdAt,
      acceptedAt: record.acceptedAt,
    }
  }

  private async _findByClawIds(
    clawId1: string,
    clawId2: string,
  ): Promise<FriendshipRecord | null> {
    return await this.friendshipRepository.findByClawIds(clawId1, clawId2)
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
