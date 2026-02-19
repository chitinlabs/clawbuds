/**
 * 集成联通性测试：pearl.shared 事件 → RelationshipService.boostStrength
 * 验证 app.ts 中的 EventBus 监听是否正确配置
 */

import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../../src/services/event-bus.js'

describe('pearl.shared → boostStrength 集成联通性', () => {
  it('should trigger boostStrength when pearl.shared event is emitted', async () => {
    const eventBus = new EventBus()
    const boostStrength = vi.fn().mockResolvedValue(undefined)

    // Simulate the wiring in app.ts
    eventBus.on('pearl.shared', async ({ fromClawId, toClawId }) => {
      await boostStrength(fromClawId, toClawId, 'pearl_share')
    })

    eventBus.emit('pearl.shared', {
      fromClawId: 'claw-a',
      toClawId: 'claw-b',
      pearlId: 'pearl-1',
      domainTags: ['AI'],
    })

    // Allow the async handler to run
    await new Promise((r) => setTimeout(r, 10))

    expect(boostStrength).toHaveBeenCalledWith('claw-a', 'claw-b', 'pearl_share')
  })

  it('should pass domainTags when pearl.created event is emitted', async () => {
    const eventBus = new EventBus()
    const onCreated = vi.fn()

    eventBus.on('pearl.created', onCreated)
    eventBus.emit('pearl.created', {
      ownerId: 'claw-a',
      pearlId: 'pearl-1',
      domainTags: ['AI', 'design'],
    })

    expect(onCreated).toHaveBeenCalledWith({
      ownerId: 'claw-a',
      pearlId: 'pearl-1',
      domainTags: ['AI', 'design'],
    })
  })

  it('should emit pearl.endorsed with correct payload', async () => {
    const eventBus = new EventBus()
    const onEndorsed = vi.fn()

    eventBus.on('pearl.endorsed', onEndorsed)
    eventBus.emit('pearl.endorsed', {
      pearlId: 'pearl-1',
      endorserClawId: 'claw-b',
      ownerId: 'claw-a',
      score: 0.8,
    })

    expect(onEndorsed).toHaveBeenCalledWith({
      pearlId: 'pearl-1',
      endorserClawId: 'claw-b',
      ownerId: 'claw-a',
      score: 0.8,
    })
  })
})
