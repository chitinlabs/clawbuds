/**
 * ProxyToM 集成联通性测试
 * 验证从 EventBus 事件触发到 FriendModel 更新的完整路径
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../src/db/database.js'
import { EventBus } from '../../../src/services/event-bus.js'
import { ProxyToMService } from '../../../src/services/proxy-tom.service.js'
import { SQLiteFriendModelRepository } from '../../../src/db/repositories/sqlite/friend-model.repository.js'
import { SQLiteClawRepository } from '../../../src/db/repositories/sqlite/claw.repository.js'
import type { FriendshipProfile } from '../../../src/services/friendship.service.js'

// 注册 EventBus 监听，模拟 app.ts 的配线
function wireProxyToM(eventBus: EventBus, proxyToMService: ProxyToMService) {
  // heartbeat.received → 更新 ToM
  eventBus.on('heartbeat.received', async ({ fromClawId, toClawId, payload }) => {
    const existing = await proxyToMService.getModel(toClawId, fromClawId)
    await proxyToMService.updateFromHeartbeat(toClawId, fromClawId, payload, existing)
  })

  // message.new → 更新 lastInteractionAt
  eventBus.on('message.new', async ({ recipientId, entry }) => {
    await proxyToMService.touchInteraction(recipientId, entry.message.fromClawId)
  })

  // friend.accepted → 双向初始化模型
  eventBus.on('friend.accepted', async ({ recipientIds }) => {
    const [clawA, clawB] = recipientIds
    await Promise.all([
      proxyToMService.initializeFriendModel(clawA, clawB),
      proxyToMService.initializeFriendModel(clawB, clawA),
    ])
  })

  // friend.removed → 清理模型
  eventBus.on('friend.removed', async ({ clawId, friendId }) => {
    await proxyToMService.removeFriendModel(clawId, friendId)
  })
}

describe('ProxyToM Integration (SQLite)', () => {
  let db: Database.Database
  let eventBus: EventBus
  let proxyToMService: ProxyToMService
  let repo: SQLiteFriendModelRepository
  let clawAId: string
  let clawBId: string

  beforeEach(async () => {
    db = createTestDatabase()
    eventBus = new EventBus()
    repo = new SQLiteFriendModelRepository(db)
    proxyToMService = new ProxyToMService(repo, eventBus)
    wireProxyToM(eventBus, proxyToMService)

    const clawRepo = new SQLiteClawRepository(db)
    const a = await clawRepo.register({ publicKey: 'pk-a', displayName: 'Alice' })
    const b = await clawRepo.register({ publicKey: 'pk-b', displayName: 'Bob' })
    clawAId = a.clawId
    clawBId = b.clawId
  })

  afterEach(() => {
    eventBus.removeAllListeners()
    db.close()
  })

  // ─────────────────────────────────────────────
  // friend.accepted → 初始化模型
  // ─────────────────────────────────────────────
  it('friend.accepted should initialize bidirectional friend models', async () => {
    eventBus.emit('friend.accepted', {
      recipientIds: [clawAId, clawBId],
      friendship: { requesterId: clawAId, accepterId: clawBId } as FriendshipProfile,
    })

    // Wait for async event handlers to complete
    await new Promise((resolve) => setTimeout(resolve, 10))

    const modelAB = await repo.get(clawAId, clawBId)
    const modelBA = await repo.get(clawBId, clawAId)
    expect(modelAB).not.toBeNull()
    expect(modelBA).not.toBeNull()
    expect(modelAB!.inferredInterests).toEqual([])
    expect(modelBA!.expertiseTags).toEqual({})
  })

  // ─────────────────────────────────────────────
  // heartbeat.received → 更新模型
  // ─────────────────────────────────────────────
  it('heartbeat.received should update inferredInterests and expertiseTags', async () => {
    // 先初始化
    await repo.create({ clawId: clawAId, friendId: clawBId })

    eventBus.emit('heartbeat.received', {
      fromClawId: clawBId,
      toClawId: clawAId,
      payload: {
        interests: ['Rust', 'Systems'],
        recentTopics: '最近在研究异步运行时',
        isKeepalive: false,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    const model = await repo.get(clawAId, clawBId)
    expect(model!.inferredInterests).toEqual(['Rust', 'Systems'])
    expect(model!.lastKnownState).toBe('最近在研究异步运行时')
    expect(model!.expertiseTags['Rust']).toBeCloseTo(0.3)
    expect(model!.lastHeartbeatAt).not.toBeNull()
  })

  // ─────────────────────────────────────────────
  // keepalive heartbeat → 语义字段不变
  // ─────────────────────────────────────────────
  it('keepalive heartbeat should NOT update semantic fields', async () => {
    await repo.create({ clawId: clawAId, friendId: clawBId })
    await repo.updateFromHeartbeat(clawAId, clawBId, {
      inferredInterests: ['Python'],
      expertiseTags: { Python: 0.5 },
      lastKnownState: '初始状态',
      lastHeartbeatAt: '2026-02-18T09:00:00Z',
    })

    eventBus.emit('heartbeat.received', {
      fromClawId: clawBId,
      toClawId: clawAId,
      payload: { isKeepalive: true },
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    const model = await repo.get(clawAId, clawBId)
    expect(model!.inferredInterests).toEqual(['Python'])   // 不变
    expect(model!.lastKnownState).toBe('初始状态')           // 不变
    expect(model!.lastHeartbeatAt).not.toBe('2026-02-18T09:00:00Z')  // 更新
  })

  // ─────────────────────────────────────────────
  // message.new → 更新 lastInteractionAt
  // ─────────────────────────────────────────────
  it('message.new should update lastInteractionAt', async () => {
    await repo.create({ clawId: clawAId, friendId: clawBId })

    eventBus.emit('message.new', {
      recipientId: clawAId,
      entry: {
        id: 'entry-1',
        seq: 1,
        status: 'unread',
        message: {
          id: 'msg-1',
          fromClawId: clawBId,
          fromDisplayName: 'Bob',
          blocks: [],
          visibility: 'direct',
          contentWarning: null,
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    const model = await repo.get(clawAId, clawBId)
    expect(model!.lastInteractionAt).not.toBeNull()
  })

  // ─────────────────────────────────────────────
  // friend.removed → 清理模型
  // ─────────────────────────────────────────────
  it('friend.removed should delete the friend model', async () => {
    await repo.create({ clawId: clawAId, friendId: clawBId })
    expect(await repo.get(clawAId, clawBId)).not.toBeNull()

    eventBus.emit('friend.removed', { clawId: clawAId, friendId: clawBId })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const model = await repo.get(clawAId, clawBId)
    expect(model).toBeNull()
  })
})
