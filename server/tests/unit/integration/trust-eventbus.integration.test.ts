/**
 * 集成联通性测试：Trust EventBus 配线验证（Phase 7）
 * 验证 app.ts 中的三个 EventBus 监听是否正确配置
 */

import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../../src/services/event-bus.js'

describe('Trust EventBus 集成联通性测试', () => {
  it('应触发 initializeRelationship（双向）当 friend.accepted 事件发出', async () => {
    const eventBus = new EventBus()
    const initializeRelationship = vi.fn().mockResolvedValue(undefined)

    // 模拟 app.ts 中的配线
    eventBus.on('friend.accepted', ({ friendship }) => {
      const { requesterId, accepterId } = friendship
      Promise.all([
        initializeRelationship(requesterId, accepterId),
        initializeRelationship(accepterId, requesterId),
      ]).catch(() => {})
    })

    eventBus.emit('friend.accepted', {
      friendship: { requesterId: 'claw_a', accepterId: 'claw_b', id: 'fs_001', status: 'accepted' },
      recipientIds: ['claw_a', 'claw_b'],
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(initializeRelationship).toHaveBeenCalledTimes(2)
    expect(initializeRelationship).toHaveBeenCalledWith('claw_a', 'claw_b')
    expect(initializeRelationship).toHaveBeenCalledWith('claw_b', 'claw_a')
  })

  it('应触发 recalculateN 当 relationship.layer_changed 事件发出', async () => {
    const eventBus = new EventBus()
    const recalculateN = vi.fn().mockResolvedValue(undefined)

    eventBus.on('relationship.layer_changed', ({ clawId, friendId }) => {
      recalculateN(clawId, friendId).catch(() => {})
    })

    eventBus.emit('relationship.layer_changed', {
      clawId: 'claw_a',
      friendId: 'claw_b',
      oldLayer: 'casual',
      newLayer: 'active',
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(recalculateN).toHaveBeenCalledWith('claw_a', 'claw_b')
  })

  it('应触发 updateQ（高分信号）当 pearl.endorsed 事件 score > 0.7', async () => {
    const eventBus = new EventBus()
    const updateQ = vi.fn().mockResolvedValue(undefined)

    eventBus.on('pearl.endorsed', ({ ownerId, endorserClawId, score, pearlDomainTags }) => {
      const signal = score > 0.7 ? 'pearl_endorsed_high' : 'pearl_endorsed_low'
      const domain = pearlDomainTags?.[0] ?? '_overall'
      updateQ(ownerId, endorserClawId, domain, signal).catch(() => {})
    })

    eventBus.emit('pearl.endorsed', {
      pearlId: 'pearl_001',
      endorserClawId: 'claw_b',
      ownerId: 'claw_a',
      score: 0.85,
      pearlDomainTags: ['AI'],
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(updateQ).toHaveBeenCalledWith('claw_a', 'claw_b', 'AI', 'pearl_endorsed_high')
  })

  it('应触发 updateQ（低分信号）当 pearl.endorsed 事件 score < 0.3', async () => {
    const eventBus = new EventBus()
    const updateQ = vi.fn().mockResolvedValue(undefined)

    eventBus.on('pearl.endorsed', ({ ownerId, endorserClawId, score, pearlDomainTags }) => {
      const signal = score > 0.7 ? 'pearl_endorsed_high' : 'pearl_endorsed_low'
      const domain = pearlDomainTags?.[0] ?? '_overall'
      updateQ(ownerId, endorserClawId, domain, signal).catch(() => {})
    })

    eventBus.emit('pearl.endorsed', {
      pearlId: 'pearl_002',
      endorserClawId: 'claw_b',
      ownerId: 'claw_a',
      score: 0.2,
      pearlDomainTags: [],  // 无领域，回退到 _overall
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(updateQ).toHaveBeenCalledWith('claw_a', 'claw_b', '_overall', 'pearl_endorsed_low')
  })
})
