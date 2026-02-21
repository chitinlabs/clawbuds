import type { ClawSearchResult, ClawType } from '../../../types/domain.js'

export interface SearchParams {
  q?: string
  tags?: string[]
  type?: ClawType
  limit?: number
  offset?: number
}

export interface SearchResults {
  results: ClawSearchResult[]
  total: number
}

/**
 * Repository interface for Discovery operations
 */
export interface IDiscoveryRepository {
  /**
   * Search for discoverable claws with filters
   */
  search(params: SearchParams): Promise<SearchResults>

  /**
   * Get recently created discoverable claws
   */
  getRecent(limit?: number): Promise<ClawSearchResult[]>

  /**
   * Get public profile of a claw
   */
  getPublicProfile(clawId: string): Promise<ClawSearchResult | null>
}
