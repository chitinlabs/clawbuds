/**
 * Supabase ReflexExecutionRepository Implementation (Phase 4)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IReflexExecutionRepository,
  ReflexExecutionRecord,
  ExecutionResult,
} from '../interfaces/reflex.repository.interface.js'

interface ReflexExecutionRow {
  id: string
  reflex_id: string
  claw_id: string
  event_type: string
  trigger_data: Record<string, unknown>  // JSONB → already parsed
  execution_result: string
  details: Record<string, unknown>       // JSONB → already parsed
  created_at: string
}

function rowToRecord(row: ReflexExecutionRow): ReflexExecutionRecord {
  return {
    id: row.id,
    reflexId: row.reflex_id,
    clawId: row.claw_id,
    eventType: row.event_type,
    triggerData: row.trigger_data ?? {},
    executionResult: row.execution_result as ExecutionResult,
    details: row.details ?? {},
    createdAt: row.created_at,
  }
}

export class SupabaseReflexExecutionRepository implements IReflexExecutionRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(data: {
    id: string
    reflexId: string
    clawId: string
    eventType: string
    triggerData: Record<string, unknown>
    executionResult: ExecutionResult
    details: Record<string, unknown>
  }): Promise<ReflexExecutionRecord> {
    const { data: row, error } = await this.supabase
      .from('reflex_executions')
      .insert({
        id: data.id,
        reflex_id: data.reflexId,
        claw_id: data.clawId,
        event_type: data.eventType,
        trigger_data: data.triggerData,
        execution_result: data.executionResult,
        details: data.details,
      })
      .select('*')
      .single()

    if (error) throw new Error(`Failed to create execution record: ${error.message}`)
    return rowToRecord(row as ReflexExecutionRow)
  }

  async findRecent(clawId: string, limit: number): Promise<ReflexExecutionRecord[]> {
    const { data: rows, error } = await this.supabase
      .from('reflex_executions')
      .select('*')
      .eq('claw_id', clawId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`Failed to find recent executions: ${error.message}`)
    return (rows as ReflexExecutionRow[]).map(rowToRecord)
  }

  async findByResult(
    clawId: string,
    result: ExecutionResult,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]> {
    let query = this.supabase
      .from('reflex_executions')
      .select('*')
      .eq('claw_id', clawId)
      .eq('execution_result', result)

    if (since) query = query.gte('created_at', since)

    query = query.order('created_at', { ascending: false })
    if (limit !== undefined) query = query.limit(limit)

    const { data: rows, error } = await query
    if (error) throw new Error(`Failed to find executions by result: ${error.message}`)
    return (rows as ReflexExecutionRow[]).map(rowToRecord)
  }

  async getStats(
    reflexId: string,
    since?: string,
  ): Promise<{ total: number; executed: number; blocked: number; queuedForL1: number }> {
    let query = this.supabase
      .from('reflex_executions')
      .select('execution_result')
      .eq('reflex_id', reflexId)

    if (since) query = query.gte('created_at', since)

    const { data: rows, error } = await query
    if (error) throw new Error(`Failed to get stats: ${error.message}`)

    const records = rows as { execution_result: string }[]
    const counts = { executed: 0, blocked: 0, queuedForL1: 0 }
    for (const r of records) {
      if (r.execution_result === 'executed') counts.executed++
      else if (r.execution_result === 'blocked') counts.blocked++
      else if (r.execution_result === 'queued_for_l1') counts.queuedForL1++
    }
    return { total: records.length, ...counts }
  }

  async findAlerts(
    clawId: string,
    since?: string,
    limit?: number,
  ): Promise<ReflexExecutionRecord[]> {
    // Join with reflexes to filter by behavior='alert'
    let query = this.supabase
      .from('reflex_executions')
      .select('*, reflex:reflexes!inner(behavior)')
      .eq('claw_id', clawId)
      .eq('reflexes.behavior', 'alert')

    if (since) query = query.gte('created_at', since)
    query = query.order('created_at', { ascending: false })
    if (limit !== undefined) query = query.limit(limit)

    const { data: rows, error } = await query
    if (error) throw new Error(`Failed to find alerts: ${error.message}`)
    return ((rows ?? []) as unknown as ReflexExecutionRow[]).map(rowToRecord)
  }

  async deleteOlderThan(cutoffDate: string): Promise<number> {
    const { data: rows, error } = await this.supabase
      .from('reflex_executions')
      .delete()
      .lt('created_at', cutoffDate)
      .select('id')

    if (error) throw new Error(`Failed to delete old executions: ${error.message}`)
    return (rows ?? []).length
  }

  async countGlobal(): Promise<{ total: number; allowed: number; blocked: number; escalated: number }> {
    const { data: rows, error } = await this.supabase
      .from('reflex_executions')
      .select('execution_result')

    if (error) throw new Error(`Failed to count global executions: ${error.message}`)

    const records = (rows ?? []) as { execution_result: string }[]
    let allowed = 0
    let blocked = 0
    let escalated = 0
    for (const r of records) {
      if (r.execution_result === 'allowed') allowed++
      else if (r.execution_result === 'blocked') blocked++
      else if (r.execution_result === 'escalated') escalated++
    }
    return { total: records.length, allowed, blocked, escalated }
  }
}
