/**
 * matchLayer0 纯函数单元测试（Phase 4）
 * 6 种条件类型全覆盖：event_type, timer, tag_intersection, threshold, counter, deadline
 */

import { describe, it, expect } from 'vitest'
import { matchLayer0 } from '../../../src/services/reflex-engine.js'
import type { ReflexRecord } from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'
import type { BusEvent } from '../../../src/services/reflex-engine.js'

function makeReflex(triggerConfig: Record<string, unknown>): ReflexRecord {
  return {
    id: 'r1',
    clawId: 'claw-a',
    name: 'test',
    valueLayer: 'infrastructure',
    behavior: 'keepalive',
    triggerLayer: 0,
    triggerConfig,
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
    createdAt: '2026-02-19T00:00:00Z',
    updatedAt: '2026-02-19T00:00:00Z',
  }
}

function makeEvent(type: string, data: Record<string, unknown> = {}): BusEvent {
  return { type, clawId: 'claw-a', ...data }
}

describe('matchLayer0', () => {
  // ─── event_type ───────────────────────────────────────────────────────────
  describe('event_type condition', () => {
    it('should match when event type matches', () => {
      const reflex = makeReflex({ type: 'event_type', eventType: 'heartbeat.received' })
      expect(matchLayer0(reflex, makeEvent('heartbeat.received'))).toBe(true)
    })

    it('should not match when event type differs', () => {
      const reflex = makeReflex({ type: 'event_type', eventType: 'heartbeat.received' })
      expect(matchLayer0(reflex, makeEvent('message.new'))).toBe(false)
    })

    it('should match event_type with downgrade condition for relationship.layer_changed', () => {
      const reflex = makeReflex({
        type: 'event_type',
        eventType: 'relationship.layer_changed',
        condition: 'downgrade',
      })
      const event = makeEvent('relationship.layer_changed', { oldLayer: 'active', newLayer: 'casual' })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should NOT match upgrade for relationship downgrade reflex', () => {
      const reflex = makeReflex({
        type: 'event_type',
        eventType: 'relationship.layer_changed',
        condition: 'downgrade',
      })
      const event = makeEvent('relationship.layer_changed', { oldLayer: 'casual', newLayer: 'active' })
      expect(matchLayer0(reflex, event)).toBe(false)
    })
  })

  // ─── timer ────────────────────────────────────────────────────────────────
  describe('timer condition', () => {
    it('should match timer.tick event with matching intervalMs', () => {
      const reflex = makeReflex({ type: 'timer', intervalMs: 300000 })
      const event = makeEvent('timer.tick', { intervalMs: 300000 })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should not match timer.tick with different intervalMs', () => {
      const reflex = makeReflex({ type: 'timer', intervalMs: 300000 })
      const event = makeEvent('timer.tick', { intervalMs: 60000 })
      expect(matchLayer0(reflex, event)).toBe(false)
    })

    it('should not match non-timer events', () => {
      const reflex = makeReflex({ type: 'timer', intervalMs: 300000 })
      expect(matchLayer0(reflex, makeEvent('message.new'))).toBe(false)
    })
  })

  // ─── tag_intersection ─────────────────────────────────────────────────────
  describe('event_type_with_tag_intersection condition', () => {
    it('should match when common tags >= minCommonTags', () => {
      const reflex = makeReflex({
        type: 'event_type_with_tag_intersection',
        eventType: 'message.new',
        minCommonTags: 1,
      })
      const event = makeEvent('message.new', {
        domainTags: ['AI', 'design'],
        senderInterests: ['AI', 'startup'],
      })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should not match when common tags < minCommonTags', () => {
      const reflex = makeReflex({
        type: 'event_type_with_tag_intersection',
        eventType: 'message.new',
        minCommonTags: 2,
      })
      const event = makeEvent('message.new', {
        domainTags: ['AI'],
        senderInterests: ['AI', 'startup'],
      })
      expect(matchLayer0(reflex, event)).toBe(false)
    })

    it('should not match when no tags provided', () => {
      const reflex = makeReflex({
        type: 'event_type_with_tag_intersection',
        eventType: 'message.new',
        minCommonTags: 1,
      })
      const event = makeEvent('message.new', { domainTags: [], senderInterests: [] })
      expect(matchLayer0(reflex, event)).toBe(false)
    })
  })

  // ─── threshold ────────────────────────────────────────────────────────────
  describe('threshold condition', () => {
    it('should match when field value < threshold (lt)', () => {
      const reflex = makeReflex({ type: 'threshold', field: 'strength', lt: 0.35 })
      const event = makeEvent('relationship.layer_changed', { strength: 0.28 })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should not match when field value >= threshold (lt)', () => {
      const reflex = makeReflex({ type: 'threshold', field: 'strength', lt: 0.35 })
      const event = makeEvent('relationship.layer_changed', { strength: 0.40 })
      expect(matchLayer0(reflex, event)).toBe(false)
    })

    it('should match when field value >= threshold (gte)', () => {
      const reflex = makeReflex({ type: 'threshold', field: 'score', gte: 0.8 })
      const event = makeEvent('test', { score: 0.9 })
      expect(matchLayer0(reflex, event)).toBe(true)
    })
  })

  // ─── counter ─────────────────────────────────────────────────────────────
  describe('counter condition', () => {
    it('should match when field count >= threshold', () => {
      const reflex = makeReflex({ type: 'counter', field: 'contributionCount', gte: 5 })
      const event = makeEvent('thread.contribution_added', { contributionCount: 5 })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should not match when count < threshold', () => {
      const reflex = makeReflex({ type: 'counter', field: 'contributionCount', gte: 5 })
      const event = makeEvent('thread.contribution_added', { contributionCount: 3 })
      expect(matchLayer0(reflex, event)).toBe(false)
    })
  })

  // ─── deadline ────────────────────────────────────────────────────────────
  describe('deadline condition', () => {
    it('should match poll.closing_soon event', () => {
      const reflex = makeReflex({
        type: 'deadline',
        eventType: 'poll.closing_soon',
        withinMs: 3600000,
      })
      const event = makeEvent('poll.closing_soon', {
        closesAt: new Date(Date.now() + 1800000).toISOString(),  // 30 min from now
      })
      expect(matchLayer0(reflex, event)).toBe(true)
    })

    it('should not match when event type is different', () => {
      const reflex = makeReflex({
        type: 'deadline',
        eventType: 'poll.closing_soon',
        withinMs: 3600000,
      })
      expect(matchLayer0(reflex, makeEvent('message.new'))).toBe(false)
    })
  })

  // ─── unknown type ────────────────────────────────────────────────────────
  describe('unknown condition type', () => {
    it('should return false for unknown triggerConfig type', () => {
      const reflex = makeReflex({ type: 'unknown_type' })
      expect(matchLayer0(reflex, makeEvent('any.event'))).toBe(false)
    })
  })
})
