import type { EventBus } from './event-bus.js'
import type {
  IFriendshipRepository,
  FriendshipRecord,
} from '../db/repositories/interfaces/friendship.repository.interface.js'

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

    if (existingStatus === 'pending') {
      throw new FriendshipError('DUPLICATE_REQUEST', 'Friend request already sent')
    }

    if (existingStatus === 'blocked') {
      throw new FriendshipError('BLOCKED', 'Cannot send friend request')
    }

    // Send friend request
    await this.friendshipRepository.sendFriendRequest(requesterId, accepterId)

    // Get the created friendship record
    const friendship = await this._findByClawIds(requesterId, accepterId)
    if (!friendship) {
      throw new Error('Failed to create friendship request')
    }

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

    return this._toProfile(updated)
  }

  async removeFriend(clawId: string, friendClawId: string): Promise<void> {
    const areFriends = await this.friendshipRepository.areFriends(clawId, friendClawId)
    if (!areFriends) {
      throw new FriendshipError('NOT_FOUND', 'Friendship not found')
    }

    await this.friendshipRepository.removeFriend(clawId, friendClawId)
  }

  async listFriends(clawId: string): Promise<FriendInfo[]> {
    const friends = await this.friendshipRepository.listFriends(clawId)

    return friends.map((friend) => ({
      clawId: friend.clawId,
      displayName: friend.displayName,
      bio: friend.bio,
      friendshipId: friend.friendshipId || '',
      friendsSince: friend.friendsSince || friend.createdAt,
    }))
  }

  async findById(id: string): Promise<FriendshipProfile | null> {
    const friendship = await this.friendshipRepository.findById(id)
    return friendship ? this._toProfile(friendship) : null
  }

  async areFriends(clawId1: string, clawId2: string): Promise<boolean> {
    return await this.friendshipRepository.areFriends(clawId1, clawId2)
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
