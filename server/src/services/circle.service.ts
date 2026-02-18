import type { FriendshipService, FriendInfo } from './friendship.service.js'
import type { ICircleRepository, CircleProfile } from '../db/repositories/interfaces/circle.repository.interface.js'
import { CircleError } from '../db/repositories/interfaces/circle.repository.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import { config } from '../config/env.js'

export type { CircleProfile } from '../db/repositories/interfaces/circle.repository.interface.js'

export class CircleService {
  constructor(
    private circleRepository: ICircleRepository,
    private friendshipService: FriendshipService,
    private cache?: ICacheService,
  ) {}

  async createCircle(ownerId: string, name: string, description?: string): Promise<CircleProfile> {
    const result = await this.circleRepository.createCircle(ownerId, name, description)
    await this.invalidateCircleCache(ownerId)
    return result
  }

  async listCircles(ownerId: string): Promise<CircleProfile[]> {
    const cacheKey = `circles:${ownerId}`
    if (this.cache) {
      const cached = await this.cache.get<CircleProfile[]>(cacheKey)
      if (cached) return cached
    }

    const result = await this.circleRepository.listCircles(ownerId)

    if (this.cache) {
      await this.cache.set(cacheKey, result, config.cacheTtlGroup)
    }
    return result
  }

  async deleteCircle(ownerId: string, circleId: string): Promise<void> {
    await this.circleRepository.deleteCircle(ownerId, circleId)
    await this.invalidateCircleCache(ownerId)
  }

  async addFriendToCircle(ownerId: string, circleId: string, friendClawId: string): Promise<void> {
    if (!await this.circleRepository.circleExists(circleId, ownerId)) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    const areFriends = await this.friendshipService.areFriends(ownerId, friendClawId)
    if (!areFriends) {
      throw new CircleError('NOT_FRIENDS', 'Can only add friends to a circle')
    }

    await this.circleRepository.addFriendToCircle(circleId, friendClawId)
    await this.invalidateCircleCache(ownerId)
  }

  async removeFriendFromCircle(ownerId: string, circleId: string, friendClawId: string): Promise<void> {
    if (!await this.circleRepository.circleExists(circleId, ownerId)) {
      throw new CircleError('NOT_FOUND', 'Circle not found')
    }

    await this.circleRepository.removeFriendFromCircle(circleId, friendClawId)
    await this.invalidateCircleCache(ownerId)
  }

  async getCircleMembers(ownerId: string, circleId: string): Promise<FriendInfo[]> {
    return this.circleRepository.getCircleMembers(ownerId, circleId)
  }

  async getFriendIdsByCircles(ownerId: string, circleNames: string[]): Promise<string[]> {
    return this.circleRepository.getFriendIdsByCircles(ownerId, circleNames)
  }

  private async invalidateCircleCache(ownerId: string): Promise<void> {
    if (!this.cache) return
    await this.cache.del(`circles:${ownerId}`)
  }
}

export { CircleError }
