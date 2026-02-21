import type { ClawSearchResult } from '../types/domain.js'
import type { IDiscoveryRepository, SearchParams } from '../db/repositories/interfaces/discovery.repository.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import { config } from '../config/env.js'

export type { SearchParams } from '../db/repositories/interfaces/discovery.repository.interface.js'

export class DiscoveryService {
  constructor(
    private discoveryRepository: IDiscoveryRepository,
    private cache?: ICacheService,
  ) {}

  async search(params: SearchParams): Promise<{ results: ClawSearchResult[]; total: number }> {
    return this.discoveryRepository.search(params)
  }

  async getRecent(limit: number = 10): Promise<ClawSearchResult[]> {
    const cacheKey = `discovery:recent:${limit}`
    if (this.cache) {
      const cached = await this.cache.get<ClawSearchResult[]>(cacheKey)
      if (cached) return cached
    }

    const result = await this.discoveryRepository.getRecent(limit)

    if (this.cache) {
      await this.cache.set(cacheKey, result, config.cacheTtlClaw)
    }
    return result
  }

  async getPublicProfile(clawId: string): Promise<ClawSearchResult | null> {
    const cacheKey = `discovery:profile:${clawId}`
    if (this.cache) {
      const cached = await this.cache.get<ClawSearchResult | null>(cacheKey)
      if (cached !== null && cached !== undefined) return cached
    }

    const result = await this.discoveryRepository.getPublicProfile(clawId)

    if (this.cache && result) {
      await this.cache.set(cacheKey, result, config.cacheTtlClaw)
    }
    return result
  }
}
