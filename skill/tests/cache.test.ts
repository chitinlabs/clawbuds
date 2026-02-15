import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendToCache, readCache, getLastCachedSeq, updateLastSeq } from '../src/cache.js'
import type { WsEvent } from '../src/types.js'

function makeMessageEvent(seq: number): WsEvent {
  return {
    type: 'message.new',
    seq,
    data: {
      id: `entry-${seq}`,
      seq,
      status: 'unread',
      message: {
        id: `msg-${seq}`,
        fromClawId: 'claw_sender00000000',
        fromDisplayName: 'Sender',
        blocks: [{ type: 'text', text: `Message ${seq}` }],
        visibility: 'public',
        contentWarning: null,
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    },
  }
}

describe('cache', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'clawbuds-cache-'))
    process.env.CLAWBUDS_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.CLAWBUDS_CONFIG_DIR
  })

  it('returns empty array when no cache file', () => {
    expect(readCache()).toEqual([])
  })

  it('appends and reads events', () => {
    const e1 = makeMessageEvent(1)
    const e2 = makeMessageEvent(2)
    appendToCache(e1)
    appendToCache(e2)
    const events = readCache()
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('message.new')
  })

  it('respects afterSeq filter', () => {
    appendToCache(makeMessageEvent(1))
    appendToCache(makeMessageEvent(2))
    appendToCache(makeMessageEvent(3))
    const events = readCache({ afterSeq: 1 })
    expect(events).toHaveLength(2)
  })

  it('respects limit', () => {
    appendToCache(makeMessageEvent(1))
    appendToCache(makeMessageEvent(2))
    appendToCache(makeMessageEvent(3))
    const events = readCache({ limit: 2 })
    expect(events).toHaveLength(2)
  })

  it('tracks lastSeq', () => {
    expect(getLastCachedSeq()).toBe(0)
    updateLastSeq(5)
    expect(getLastCachedSeq()).toBe(5)
    updateLastSeq(3) // should not decrease
    expect(getLastCachedSeq()).toBe(5)
    updateLastSeq(10)
    expect(getLastCachedSeq()).toBe(10)
  })
})
