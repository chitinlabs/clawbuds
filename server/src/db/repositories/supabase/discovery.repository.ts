import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClawSearchResult, ClawType } from '../../../types/domain.js'
import type { IDiscoveryRepository, SearchParams, SearchResults } from '../interfaces/discovery.repository.interface.js'

interface DiscoveryRow {
  claw_id: string
  display_name: string
  bio: string
  claw_type: ClawType
  tags: string[] | string
  avatar_url: string | null
  last_seen_at: string
}

function rowToSearchResult(row: DiscoveryRow): ClawSearchResult {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags
  return {
    clawId: row.claw_id,
    displayName: row.display_name,
    bio: row.bio,
    clawType: row.claw_type,
    tags,
    avatarUrl: row.avatar_url ?? undefined,
    isOnline: row.last_seen_at >= fiveMinAgo,
  }
}

export class SupabaseDiscoveryRepository implements IDiscoveryRepository {
  constructor(private supabase: SupabaseClient) {}

  async search(params: SearchParams): Promise<SearchResults> {
    const limit = params.limit ?? 20
    const offset = params.offset ?? 0

    // Start query builder
    let query = this.supabase
      .from('claws')
      .select('claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at', { count: 'exact' })
      .eq('discoverable', true)
      .eq('status', 'active')

    // Apply filters
    if (params.q) {
      // Case-insensitive search in display_name or bio
      query = query.or(`display_name.ilike.%${params.q}%,bio.ilike.%${params.q}%`)
    }

    if (params.tags && params.tags.length > 0) {
      // Check if tags JSONB array contains all specified tags
      // Pass as JSON string since .contains() with arrays generates PostgreSQL array
      // format {val} instead of JSONB format ["val"]
      query = query.contains('tags', JSON.stringify(params.tags))
    }

    if (params.type) {
      query = query.eq('claw_type', params.type)
    }

    // Apply ordering and pagination
    query = query
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query.throwOnError()

    if (error) {
      throw error
    }

    return {
      results: (data || []).map((row: any) => rowToSearchResult(row as DiscoveryRow)),
      total: count ?? 0,
    }
  }

  async getRecent(limit: number = 10): Promise<ClawSearchResult[]> {
    const { data, error } = await this.supabase
      .from('claws')
      .select('claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at')
      .eq('discoverable', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit)
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => rowToSearchResult(row as DiscoveryRow))
  }

  async getPublicProfile(clawId: string): Promise<ClawSearchResult | null> {
    const { data, error } = await this.supabase
      .from('claws')
      .select('claw_id, display_name, bio, claw_type, tags, avatar_url, last_seen_at')
      .eq('claw_id', clawId)
      .eq('status', 'active')
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data ? rowToSearchResult(data as DiscoveryRow) : null
  }
}
