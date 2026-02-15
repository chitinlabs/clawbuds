import { appendFileSync, readFileSync } from 'node:fs'
import { inboxCachePath, loadState, saveState, ensureConfigDir } from './config.js'
import type { WsEvent } from './types.js'

export function appendToCache(event: WsEvent): void {
  ensureConfigDir()
  appendFileSync(inboxCachePath(), JSON.stringify(event) + '\n')
}

export function readCache(opts?: { limit?: number; afterSeq?: number }): WsEvent[] {
  const limit = opts?.limit ?? 100
  const afterSeq = opts?.afterSeq ?? 0

  let raw: string
  try {
    raw = readFileSync(inboxCachePath(), 'utf-8')
  } catch {
    return []
  }

  const lines = raw.trim().split('\n').filter(Boolean)
  const events: WsEvent[] = []

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as WsEvent
      if (event.type === 'message.new' && event.seq <= afterSeq) continue
      events.push(event)
      if (events.length >= limit) break
    } catch {
      // skip malformed lines
    }
  }

  return events
}

export function getLastCachedSeq(): number {
  const state = loadState()
  // For backward compatibility, check for global _lastSeq first
  return (state as Record<string, unknown>)._lastSeq as number || 0
}

export function updateLastSeq(seq: number): void {
  const state = loadState()
  const currentSeq = getLastCachedSeq()
  if (seq > currentSeq) {
    saveState({ ...state, _lastSeq: seq })
  }
}
