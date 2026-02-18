import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { IE2eeRepository, E2eeKeyProfile, SenderKeyProfile, UploadSenderKeyInput } from '../interfaces/e2ee.repository.interface.js'
import { E2eeError } from '../interfaces/e2ee.repository.interface.js'

interface E2eeKeyRow {
  claw_id: string
  x25519_public_key: string
  key_fingerprint: string
  created_at: string
  rotated_at: string | null
}

interface SenderKeyRow {
  id: string
  group_id: string
  sender_id: string
  recipient_id: string
  encrypted_key: string
  key_generation: number
  created_at: string
}

function rowToProfile(row: E2eeKeyRow): E2eeKeyProfile {
  return {
    clawId: row.claw_id,
    x25519PublicKey: row.x25519_public_key,
    keyFingerprint: row.key_fingerprint,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
  }
}

function senderKeyRowToProfile(row: SenderKeyRow): SenderKeyProfile {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    encryptedKey: row.encrypted_key,
    keyGeneration: row.key_generation,
    createdAt: row.created_at,
  }
}

export class SupabaseE2eeRepository implements IE2eeRepository {
  constructor(private supabase: SupabaseClient) {}

  async registerKey(clawId: string, x25519PublicKey: string, fingerprint: string): Promise<E2eeKeyProfile> {
    const existing = await this.findByClawId(clawId)

    if (existing) {
      const { data, error } = await this.supabase
        .from('e2ee_keys')
        .update({
          x25519_public_key: x25519PublicKey,
          key_fingerprint: fingerprint,
          rotated_at: new Date().toISOString(),
        })
        .eq('claw_id', clawId)
        .select()
        .single()
        .throwOnError()

      if (error) {
        throw error
      }

      return rowToProfile(data as E2eeKeyRow)
    }

    const { data, error } = await this.supabase
      .from('e2ee_keys')
      .insert({
        claw_id: clawId,
        x25519_public_key: x25519PublicKey,
        key_fingerprint: fingerprint,
      })
      .select()
      .single()
      .throwOnError()

    if (error) {
      throw error
    }

    return rowToProfile(data as E2eeKeyRow)
  }

  async findByClawId(clawId: string): Promise<E2eeKeyProfile | null> {
    const { data, error } = await this.supabase
      .from('e2ee_keys')
      .select('*')
      .eq('claw_id', clawId)
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data ? rowToProfile(data as E2eeKeyRow) : null
  }

  async findByClawIds(clawIds: string[]): Promise<E2eeKeyProfile[]> {
    if (clawIds.length === 0) return []

    const { data, error } = await this.supabase
      .from('e2ee_keys')
      .select('*')
      .in('claw_id', clawIds)
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => rowToProfile(row as E2eeKeyRow))
  }

  async deleteKey(clawId: string): Promise<void> {
    const { count, error } = await this.supabase
      .from('e2ee_keys')
      .delete({ count: 'exact' })
      .eq('claw_id', clawId)
      .throwOnError()

    if (error) {
      throw error
    }

    if (count === 0) {
      throw new E2eeError('NOT_FOUND', 'No E2EE key registered')
    }
  }

  async uploadSenderKeys(
    groupId: string,
    senderId: string,
    keys: UploadSenderKeyInput[],
    keyGeneration: number,
  ): Promise<SenderKeyProfile[]> {
    // Prepare rows for upsert
    const rows = keys.map(key => ({
      id: randomUUID(),
      group_id: groupId,
      sender_id: senderId,
      recipient_id: key.recipientId,
      encrypted_key: key.encryptedKey,
      key_generation: keyGeneration,
    }))

    // Batch upsert
    const { data, error } = await this.supabase
      .from('group_sender_keys')
      .upsert(rows, {
        onConflict: 'group_id,sender_id,recipient_id,key_generation',
      })
      .select()
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => senderKeyRowToProfile(row as SenderKeyRow))
  }

  async getSenderKeys(groupId: string, recipientId: string): Promise<SenderKeyProfile[]> {
    const { data, error } = await this.supabase
      .from('group_sender_keys')
      .select('*')
      .eq('group_id', groupId)
      .eq('recipient_id', recipientId)
      .order('key_generation', { ascending: false })
      .order('sender_id', { ascending: true })
      .throwOnError()

    if (error) {
      throw error
    }

    return (data || []).map((row: any) => senderKeyRowToProfile(row as SenderKeyRow))
  }

  async getLatestKeyGeneration(groupId: string, senderId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('group_sender_keys')
      .select('key_generation')
      .eq('group_id', groupId)
      .eq('sender_id', senderId)
      .order('key_generation', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError()

    if (error) {
      throw error
    }

    return data?.key_generation || 0
  }
}
