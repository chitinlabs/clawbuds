/**
 * Supabase PearlRepository Implementation (Phase 3)
 * 处理 pearls / pearl_references / pearl_shares 三张表
 * Supabase 使用 JSONB，domain_tags/share_conditions 由客户端自动反序列化
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type {
  IPearlRepository,
  PearlMetadataRecord,
  PearlContentRecord,
  PearlFullRecord,
  PearlReferenceRecord,
  CreatePearlData,
  UpdatePearlData,
  PearlFilters,
} from '../interfaces/pearl.repository.interface.js'

// Supabase JSONB 字段直接返回解析后的值
interface PearlMetaRow {
  id: string
  owner_id: string
  type: string
  trigger_text: string
  domain_tags: string[]           // JSONB → already parsed
  luster: number
  shareability: string
  share_conditions: Record<string, unknown> | null  // JSONB → already parsed
  created_at: string
  updated_at: string
}

interface PearlContentRow extends PearlMetaRow {
  body: string | null
  context: string | null
  origin_type: string
}

interface PearlReferenceRow {
  id: string
  pearl_id: string
  type: string
  content: string
  created_at: string
}

const METADATA_COLUMNS =
  'id, owner_id, type, trigger_text, domain_tags, luster, shareability, share_conditions, created_at, updated_at'

function rowToMetadata(row: PearlMetaRow): PearlMetadataRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type as PearlMetadataRecord['type'],
    triggerText: row.trigger_text,
    domainTags: row.domain_tags ?? [],
    luster: row.luster,
    shareability: row.shareability as PearlMetadataRecord['shareability'],
    shareConditions: row.share_conditions ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToContent(row: PearlContentRow): PearlContentRecord {
  return {
    ...rowToMetadata(row),
    body: row.body,
    context: row.context,
    originType: row.origin_type as PearlContentRecord['originType'],
  }
}

function refRowToRecord(row: PearlReferenceRow): PearlReferenceRecord {
  return {
    id: row.id,
    pearlId: row.pearl_id,
    type: row.type as PearlReferenceRecord['type'],
    content: row.content,
    createdAt: row.created_at,
  }
}

export class SupabasePearlRepository implements IPearlRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(data: CreatePearlData): Promise<PearlContentRecord> {
    const now = new Date().toISOString()
    const { data: row, error } = await this.supabase
      .from('pearls')
      .insert({
        id: data.id,
        owner_id: data.ownerId,
        type: data.type,
        trigger_text: data.triggerText,
        domain_tags: data.domainTags,
        shareability: data.shareability,
        share_conditions: data.shareConditions ?? null,
        body: data.body ?? null,
        context: data.context ?? null,
        origin_type: data.originType,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to create pearl: ${error.message}`)
    }

    return rowToContent(row as PearlContentRow)
  }

  async findById(
    id: string,
    level: 0 | 1 | 2,
  ): Promise<PearlMetadataRecord | PearlContentRecord | PearlFullRecord | null> {
    /** 22P02 = invalid_text_representation (non-UUID string for UUID column) */
    const NOT_FOUND_CODES = new Set(['PGRST116', '22P02'])

    if (level === 0) {
      const { data: row, error } = await this.supabase
        .from('pearls')
        .select(METADATA_COLUMNS)
        .eq('id', id)
        .single()

      if (error) {
        if (NOT_FOUND_CODES.has(error.code)) return null
        throw new Error(`Failed to find pearl: ${error.message}`)
      }

      return rowToMetadata(row as PearlMetaRow)
    }

    const { data: row, error } = await this.supabase
      .from('pearls')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (NOT_FOUND_CODES.has(error.code)) return null
      throw new Error(`Failed to find pearl: ${error.message}`)
    }

    if (level === 1) {
      return rowToContent(row as PearlContentRow)
    }

    // level === 2: fetch references
    const { data: refRows, error: refError } = await this.supabase
      .from('pearl_references')
      .select('*')
      .eq('pearl_id', id)
      .order('created_at', { ascending: true })

    if (refError) {
      throw new Error(`Failed to fetch pearl references: ${refError.message}`)
    }

    return {
      ...rowToContent(row as PearlContentRow),
      references: (refRows as PearlReferenceRow[]).map(refRowToRecord),
    }
  }

  async findByOwner(ownerId: string, filters?: PearlFilters): Promise<PearlMetadataRecord[]> {
    let query = this.supabase
      .from('pearls')
      .select(METADATA_COLUMNS)
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })

    if (filters?.type) {
      query = query.eq('type', filters.type)
    }
    if (filters?.shareability) {
      query = query.eq('shareability', filters.shareability)
    }
    if (filters?.since) {
      query = query.gte('created_at', filters.since)
    }
    if (filters?.limit !== undefined) {
      query = query.limit(filters.limit)
    }
    if (filters?.offset !== undefined) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit ?? 100) - 1,
      )
    }

    const { data: rows, error } = await query

    if (error) {
      throw new Error(`Failed to find pearls by owner: ${error.message}`)
    }

    let records = (rows as PearlMetaRow[]).map(rowToMetadata)

    // Post-query filter for domain tag (JSONB containment)
    if (filters?.domain) {
      const domain = filters.domain
      records = records.filter((r) => r.domainTags.includes(domain))
    }

    return records
  }

  async update(id: string, data: UpdatePearlData): Promise<PearlContentRecord> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (data.triggerText !== undefined) payload['trigger_text'] = data.triggerText
    if ('body' in data) payload['body'] = data.body ?? null
    if ('context' in data) payload['context'] = data.context ?? null
    if (data.domainTags !== undefined) payload['domain_tags'] = data.domainTags
    if (data.shareability !== undefined) payload['shareability'] = data.shareability
    if ('shareConditions' in data) payload['share_conditions'] = data.shareConditions ?? null

    const { data: row, error } = await this.supabase
      .from('pearls')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new Error(`Pearl not found: ${id}`)
      throw new Error(`Failed to update pearl: ${error.message}`)
    }

    return rowToContent(row as PearlContentRow)
  }

  async updateLuster(id: string, luster: number): Promise<void> {
    const { error } = await this.supabase
      .from('pearls')
      .update({ luster, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to update pearl luster: ${error.message}`)
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from('pearls').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete pearl: ${error.message}`)
    }
  }

  async getPearlDomainTags(ownerId: string, since?: Date): Promise<string[]> {
    let query = this.supabase
      .from('pearls')
      .select('domain_tags')
      .eq('owner_id', ownerId)

    if (since) {
      query = query.gte('created_at', since.toISOString())
    }

    const { data: rows, error } = await query

    if (error) {
      throw new Error(`Failed to get pearl domain tags: ${error.message}`)
    }

    const tagSet = new Set<string>()
    for (const row of rows as { domain_tags: string[] }[]) {
      for (const tag of row.domain_tags ?? []) {
        tagSet.add(tag)
      }
    }
    return [...tagSet]
  }

  async getRoutingCandidates(ownerId: string): Promise<PearlMetadataRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('pearls')
      .select(METADATA_COLUMNS)
      .eq('owner_id', ownerId)
      .neq('shareability', 'private')
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get routing candidates: ${error.message}`)
    }

    return (rows as PearlMetaRow[]).map(rowToMetadata)
  }

  async isVisibleTo(pearlId: string, clawId: string): Promise<boolean> {
    const { data: pearl, error } = await this.supabase
      .from('pearls')
      .select('owner_id, shareability')
      .eq('id', pearlId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return false
      throw new Error(`Failed to check pearl visibility: ${error.message}`)
    }

    const row = pearl as { owner_id: string; shareability: string }
    if (row.owner_id === clawId) return true
    if (row.shareability === 'public') return true

    // Check if pearl was shared with this claw
    const { data: share } = await this.supabase
      .from('pearl_shares')
      .select('id')
      .eq('pearl_id', pearlId)
      .eq('to_claw_id', clawId)
      .maybeSingle()

    return !!share
  }

  async addReference(
    pearlId: string,
    data: Omit<PearlReferenceRecord, 'id' | 'pearlId' | 'createdAt'>,
  ): Promise<PearlReferenceRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()

    const { data: row, error } = await this.supabase
      .from('pearl_references')
      .insert({ id, pearl_id: pearlId, type: data.type, content: data.content, created_at: now })
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to add reference: ${error.message}`)
    }

    return refRowToRecord(row as PearlReferenceRow)
  }

  async removeReference(referenceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pearl_references')
      .delete()
      .eq('id', referenceId)

    if (error) {
      throw new Error(`Failed to remove reference: ${error.message}`)
    }
  }

  async getReferences(pearlId: string): Promise<PearlReferenceRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('pearl_references')
      .select('*')
      .eq('pearl_id', pearlId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to get references: ${error.message}`)
    }

    return (rows as PearlReferenceRow[]).map(refRowToRecord)
  }

  async createShare(data: {
    id: string
    pearlId: string
    fromClawId: string
    toClawId: string
  }): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.supabase.from('pearl_shares').upsert(
      {
        id: data.id,
        pearl_id: data.pearlId,
        from_claw_id: data.fromClawId,
        to_claw_id: data.toClawId,
        created_at: now,
      },
      { onConflict: 'pearl_id,from_claw_id,to_claw_id', ignoreDuplicates: true },
    )

    if (error) {
      throw new Error(`Failed to create share: ${error.message}`)
    }
  }

  async getReceivedPearls(
    toClawId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<
    Array<{
      share: { id: string; fromClawId: string; createdAt: string }
      pearl: PearlMetadataRecord
    }>
  > {
    let query = this.supabase
      .from('pearl_shares')
      .select(`id, from_claw_id, created_at, pearl:pearls(${METADATA_COLUMNS})`)
      .eq('to_claw_id', toClawId)
      .order('created_at', { ascending: false })

    if (filters?.limit !== undefined && filters?.offset !== undefined) {
      query = query.range(filters.offset, filters.offset + filters.limit - 1)
    } else if (filters?.limit !== undefined) {
      query = query.limit(filters.limit)
    }

    const { data: rows, error } = await query

    if (error) {
      throw new Error(`Failed to get received pearls: ${error.message}`)
    }

    return (
      (rows ?? []) as unknown as Array<{
        id: string
        from_claw_id: string
        created_at: string
        pearl: PearlMetaRow
      }>
    ).map((row) => ({
      share: {
        id: row.id,
        fromClawId: row.from_claw_id,
        createdAt: row.created_at,
      },
      pearl: rowToMetadata(row.pearl),
    }))
  }

  async hasBeenSharedWith(pearlId: string, toClawId: string): Promise<boolean> {
    const { data: row } = await this.supabase
      .from('pearl_shares')
      .select('id')
      .eq('pearl_id', pearlId)
      .eq('to_claw_id', toClawId)
      .maybeSingle()

    return !!row
  }
}
