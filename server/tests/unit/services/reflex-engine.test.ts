/**
 * ReflexEngine Unit Tests（Phase 4）
 * T11-T20: 核心路由、硬约束、执行逻辑
 * Phase 9: route_pearl_by_interest Layer 1 集成 (T12/T13)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReflexEngine, BUILTIN_REFLEXES } from '../../../src/services/reflex-engine.js'
import type {
  IReflexRepository,
  IReflexExecutionRepository,
  ReflexRecord,
  ReflexExecutionRecord,
} from '../../../src/db/repositories/interfaces/reflex.repository.interface.js'

function makeReflex(overrides: Partial<ReflexRecord> = {}): ReflexRecord {
  return {
    id: 'r-' + Math.random().toString(36).slice(2),
    clawId: 'claw-a',
    name: 'test_reflex',
    valueLayer: 'infrastructure',
    behavior: 'keepalive',
    triggerLayer: 0,
    triggerConfig: { type: 'event_type', eventType: 'test.event' },
    enabled: true,
    confidence: 1.0,
    source: 'builtin',
    createdAt: '2026-02-19T00:00:00Z',
    updatedAt: '2026-02-19T00:00:00Z',
    ...overrides,
  }
}

function makeExecRecord(overrides: Partial<ReflexExecutionRecord> = {}): ReflexExecutionRecord {
  return {
    id: 'e-1', reflexId: 'r-1', clawId: 'claw-a', eventType: 'test',
    triggerData: {}, executionResult: 'executed', details: {},
    createdAt: '2026-02-19T00:00:00Z', ...overrides,
  }
}

function makeReflexRepo(reflexes: ReflexRecord[] = []): IReflexRepository {
  return {
    create: vi.fn().mockResolvedValue(reflexes[0] ?? makeReflex()),
    findByName: vi.fn().mockResolvedValue(reflexes[0] ?? null),
    findEnabled: vi.fn().mockResolvedValue(reflexes),
    findAll: vi.fn().mockResolvedValue(reflexes),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    updateConfidence: vi.fn().mockResolvedValue(undefined),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    upsertBuiltins: vi.fn().mockResolvedValue(undefined),
  }
}

function makeExecRepo(): IReflexExecutionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeExecRecord()),
    findRecent: vi.fn().mockResolvedValue([]),
    findByResult: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, executed: 0, blocked: 0, queuedForL1: 0 }),
    findAlerts: vi.fn().mockResolvedValue([]),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  }
}

function makeHeartbeatService() {
  return { sendHeartbeats: vi.fn().mockResolvedValue(undefined) } as any
}

function makeReactionService() {
  return { addReaction: vi.fn().mockResolvedValue(undefined) } as any
}

function makeClawService() {
  return {} as any
}

function makeEventBus() {
  const handlers = new Map<string, ((data: any) => void)[]>()
  return {
    emit: vi.fn(),
    on: vi.fn().mockImplementation((event: string, handler: (data: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push(handler)
    }),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    _trigger: (event: string, data: any) => {
      const hs = handlers.get(event) ?? []
      hs.forEach((h) => h(data))
    },
  } as any
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ReflexEngine - BUILTIN_REFLEXES', () => {
  it('should define 6 builtin reflexes', () => {
    expect(BUILTIN_REFLEXES).toHaveLength(6)
  })

  it('should include all required reflex names', () => {
    const names = BUILTIN_REFLEXES.map((r) => r.name)
    expect(names).toContain('keepalive_heartbeat')
    expect(names).toContain('phatic_micro_reaction')
    expect(names).toContain('track_thread_progress')
    expect(names).toContain('collect_poll_responses')
    expect(names).toContain('relationship_decay_alert')
    expect(names).toContain('audit_behavior_log')
  })

  it('all builtin reflexes should have triggerLayer=0', () => {
    expect(BUILTIN_REFLEXES.every((r) => r.triggerLayer === 0)).toBe(true)
  })
})

describe('ReflexEngine - initialize', () => {
  it('should register event subscriptions on initialize', async () => {
    const eventBus = makeEventBus()
    const reflexRepo = makeReflexRepo()
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), eventBus)
    engine.initialize()
    expect(eventBus.on).toHaveBeenCalledWith('message.new', expect.any(Function))
    expect(eventBus.on).toHaveBeenCalledWith('heartbeat.received', expect.any(Function))
    expect(eventBus.on).toHaveBeenCalledWith('relationship.layer_changed', expect.any(Function))
    expect(eventBus.on).toHaveBeenCalledWith('timer.tick', expect.any(Function))
    expect(eventBus.on).toHaveBeenCalledWith('poll.closing_soon', expect.any(Function))
  })
})

describe('ReflexEngine - initializeBuiltins', () => {
  it('should call upsertBuiltins with 6 reflexes', async () => {
    const reflexRepo = makeReflexRepo()
    const engine = new ReflexEngine(reflexRepo, makeExecRepo(), makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())
    await engine.initializeBuiltins('claw-a')
    expect(reflexRepo.upsertBuiltins).toHaveBeenCalledWith('claw-a', expect.arrayContaining([
      expect.objectContaining({ name: 'keepalive_heartbeat' }),
      expect.objectContaining({ name: 'audit_behavior_log' }),
    ]))
    const call = (reflexRepo.upsertBuiltins as any).mock.calls[0]
    expect(call[1]).toHaveLength(6)
  })
})

describe('ReflexEngine - onEvent', () => {
  it('should execute keepalive_heartbeat on timer.tick', async () => {
    const keepaliveReflex = makeReflex({
      name: 'keepalive_heartbeat',
      behavior: 'keepalive',
      triggerConfig: { type: 'timer', intervalMs: 300000 },
    })
    const reflexRepo = makeReflexRepo([keepaliveReflex])
    const execRepo = makeExecRepo()
    const heartbeatService = makeHeartbeatService()
    const engine = new ReflexEngine(reflexRepo, execRepo, heartbeatService, makeReactionService(), makeClawService(), makeEventBus())

    await engine.onEvent({ type: 'timer.tick', clawId: 'claw-a', intervalMs: 300000 })

    expect(heartbeatService.sendHeartbeats).toHaveBeenCalledWith('claw-a')
    expect(execRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      executionResult: 'executed',
    }))
  })

  it('should log relationship_decay_alert on downgrade', async () => {
    const alertReflex = makeReflex({
      name: 'relationship_decay_alert',
      behavior: 'alert',
      triggerConfig: {
        type: 'event_type',
        eventType: 'relationship.layer_changed',
        condition: 'downgrade',
      },
    })
    const reflexRepo = makeReflexRepo([alertReflex])
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await engine.onEvent({
      type: 'relationship.layer_changed',
      clawId: 'claw-a',
      friendId: 'friend-1',
      oldLayer: 'active',
      newLayer: 'casual',
      strength: 0.28,
    })

    expect(execRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      executionResult: 'executed',
      details: expect.objectContaining({ alertType: 'relationship_downgrade' }),
    }))
  })

  it('should NOT trigger alert on upgrade', async () => {
    const alertReflex = makeReflex({
      name: 'relationship_decay_alert',
      behavior: 'alert',
      triggerConfig: {
        type: 'event_type',
        eventType: 'relationship.layer_changed',
        condition: 'downgrade',
      },
    })
    const reflexRepo = makeReflexRepo([alertReflex])
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await engine.onEvent({
      type: 'relationship.layer_changed',
      clawId: 'claw-a',
      friendId: 'friend-1',
      oldLayer: 'casual',
      newLayer: 'active',
      strength: 0.5,
    })

    expect(execRepo.create).not.toHaveBeenCalled()
  })

  it('should queue Layer 1 reflex without executing', async () => {
    const l1Reflex = makeReflex({ triggerLayer: 1, behavior: 'sense' })
    const reflexRepo = makeReflexRepo([l1Reflex])
    // findEnabled for layer 0 returns empty, but we test onEvent directly with triggerLayer=1
    reflexRepo.findEnabled = vi.fn().mockResolvedValue([l1Reflex])
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await engine.onEvent({ type: 'test.event', clawId: 'claw-a' })

    expect(execRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      executionResult: 'queued_for_l1',
    }))
  })

  it('should skip event when clawId is missing', async () => {
    const reflexRepo = makeReflexRepo([makeReflex()])
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await engine.onEvent({ type: 'test', clawId: '' })

    expect(reflexRepo.findEnabled).not.toHaveBeenCalled()
  })
})

describe('ReflexEngine - checkHardConstraints', () => {
  it('keepalive behavior should not be constrained', async () => {
    const keepaliveReflex = makeReflex({
      name: 'keepalive_heartbeat',
      behavior: 'keepalive',
      triggerConfig: { type: 'timer', intervalMs: 300000 },
    })
    const reflexRepo = makeReflexRepo([keepaliveReflex])
    const execRepo = makeExecRepo()
    const heartbeatService = makeHeartbeatService()
    const engine = new ReflexEngine(reflexRepo, execRepo, heartbeatService, makeReactionService(), makeClawService(), makeEventBus())

    // Even if there are many messages, keepalive should still execute
    await engine.onEvent({ type: 'timer.tick', clawId: 'claw-no-limit', intervalMs: 300000 })
    expect(heartbeatService.sendHeartbeats).toHaveBeenCalled()
  })
})

describe('ReflexEngine - disableReflex', () => {
  it('should throw when trying to disable audit_behavior_log', async () => {
    const reflexRepo = makeReflexRepo([makeReflex({ name: 'audit_behavior_log' })])
    reflexRepo.findByName = vi.fn().mockResolvedValue(makeReflex({ name: 'audit_behavior_log' }))
    const engine = new ReflexEngine(reflexRepo, makeExecRepo(), makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await expect(engine.disableReflex('claw-a', 'audit_behavior_log')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('should disable other reflexes', async () => {
    const reflexRepo = makeReflexRepo()
    reflexRepo.findByName = vi.fn().mockResolvedValue(makeReflex({ name: 'phatic_micro_reaction' }))
    const engine = new ReflexEngine(reflexRepo, makeExecRepo(), makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await engine.disableReflex('claw-a', 'phatic_micro_reaction')
    expect(reflexRepo.setEnabled).toHaveBeenCalledWith('claw-a', 'phatic_micro_reaction', false)
  })

  it('should throw NOT_FOUND when reflex does not exist', async () => {
    const reflexRepo = makeReflexRepo()
    reflexRepo.findByName = vi.fn().mockResolvedValue(null)
    const engine = new ReflexEngine(reflexRepo, makeExecRepo(), makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    await expect(engine.disableReflex('claw-a', 'non_existent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('ReflexEngine - collect_poll_responses', () => {
  it('should log execution when poll is closing soon', async () => {
    const pollReflex = makeReflex({
      name: 'collect_poll_responses',
      behavior: 'collect',
      triggerConfig: { type: 'deadline', eventType: 'poll.closing_soon', withinMs: 3600000 },
    })
    const reflexRepo = makeReflexRepo([pollReflex])
    const execRepo = makeExecRepo()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus())

    const closesAt = new Date(Date.now() + 1800000).toISOString()
    await engine.onEvent({ type: 'poll.closing_soon', clawId: 'claw-a', pollId: 'poll-1', closesAt })

    expect(execRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      executionResult: 'executed',
      details: expect.objectContaining({ action: 'poll_response_collected' }),
    }))
  })
})

describe('ReflexEngine - phatic_micro_reaction', () => {
  it('should send reaction when tags match', async () => {
    const reactionReflex = makeReflex({
      name: 'phatic_micro_reaction',
      behavior: 'audit',
      triggerConfig: { type: 'event_type_with_tag_intersection', eventType: 'message.new', minCommonTags: 1 },
    })
    const reflexRepo = makeReflexRepo([reactionReflex])
    const execRepo = makeExecRepo()
    const reactionService = makeReactionService()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), reactionService, makeClawService(), makeEventBus())

    await engine.onEvent({
      type: 'message.new',
      clawId: 'claw-b',  // use unique clawId to avoid counter from other tests
      messageId: 'msg-1',
      domainTags: ['AI', 'design'],
      senderInterests: ['AI', 'startup'],
    })

    expect(reactionService.addReaction).toHaveBeenCalledWith('msg-1', 'claw-b', '👍')
    expect(execRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      executionResult: 'executed',
      details: expect.objectContaining({ emoji: '👍' }),
    }))
  })

  it('should NOT send reaction when no tag intersection', async () => {
    const reactionReflex = makeReflex({
      name: 'phatic_micro_reaction',
      behavior: 'audit',
      triggerConfig: { type: 'event_type_with_tag_intersection', eventType: 'message.new', minCommonTags: 1 },
    })
    const reflexRepo = makeReflexRepo([reactionReflex])
    const execRepo = makeExecRepo()
    const reactionService = makeReactionService()
    const engine = new ReflexEngine(reflexRepo, execRepo, makeHeartbeatService(), reactionService, makeClawService(), makeEventBus())

    await engine.onEvent({
      type: 'message.new',
      clawId: 'claw-c',
      messageId: 'msg-2',
      domainTags: ['sports'],
      senderInterests: ['AI', 'design'],
    })

    expect(reactionService.addReaction).not.toHaveBeenCalled()
    expect(execRepo.create).not.toHaveBeenCalled()  // no match = no log
  })
})

// ─── Phase 9: route_pearl_by_interest Layer 1 集成 (T12/T13) ─────────────────

import type { PearlRoutingService, RoutingContext } from '../../../src/services/pearl-routing.service.js'

describe('ReflexEngine - route_pearl_by_interest (Phase 9)', () => {
  function makeBatchProcessor() {
    return { enqueue: vi.fn(), acknowledgeBatch: vi.fn() } as any
  }

  function makePearlRoutingService(context: RoutingContext | null = null): PearlRoutingService {
    return {
      buildRoutingContext: vi.fn().mockResolvedValue(context),
      preFilter: vi.fn().mockResolvedValue([]),
      trustFilter: vi.fn().mockResolvedValue([]),
      executeRoute: vi.fn().mockResolvedValue(undefined),
      recordRoutingEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as PearlRoutingService
  }

  const routeReflex = makeReflex({
    name: 'route_pearl_by_interest',
    triggerLayer: 1,
    triggerConfig: {
      type: 'event_type',
      eventType: 'heartbeat.received',
      condition: 'has_routing_candidates_after_prefilter',
    },
  })

  const mockRoutingContext: RoutingContext = {
    friendId: 'friend-1',
    friendInterests: ['AI'],
    friendToM: null,
    candidates: [{
      id: 'pearl-1',
      ownerId: 'owner-1',
      type: 'insight',
      triggerText: 'test',
      domainTags: ['AI'],
      luster: 0.7,
      shareability: 'friends_only',
      shareConditions: null,
      createdAt: '2026-02-21T',
      updatedAt: '2026-02-21T',
    }],
    trustScores: { AI: 0.8 },
  }

  it('should enqueue route_pearl_by_interest when routing context is non-null', async () => {
    const reflexRepo = makeReflexRepo([routeReflex])
    const execRepo = makeExecRepo()
    const batchProcessor = makeBatchProcessor()
    const routingService = makePearlRoutingService(mockRoutingContext)

    const engine = new ReflexEngine(
      reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus()
    )
    engine.activateLayer1(batchProcessor)
    engine.injectPearlRoutingService(routingService)

    await engine.onEvent({
      type: 'heartbeat.received',
      clawId: 'owner-1',
      fromClawId: 'friend-1',
      toClawId: 'owner-1',
      payload: { interests: ['AI'] },
    })

    expect(batchProcessor.enqueue).toHaveBeenCalledOnce()
    const enqueued = batchProcessor.enqueue.mock.calls[0][0]
    expect(enqueued.reflexName).toBe('route_pearl_by_interest')
    // triggerData should include the routing context
    expect(enqueued.triggerData).toMatchObject(expect.objectContaining({
      routingContext: expect.objectContaining({ friendId: 'friend-1' }),
    }))
  })

  it('should NOT enqueue when routing context is null (no candidates after prefilter)', async () => {
    const reflexRepo = makeReflexRepo([routeReflex])
    const execRepo = makeExecRepo()
    const batchProcessor = makeBatchProcessor()
    const routingService = makePearlRoutingService(null)  // no candidates

    const engine = new ReflexEngine(
      reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus()
    )
    engine.activateLayer1(batchProcessor)
    engine.injectPearlRoutingService(routingService)

    await engine.onEvent({
      type: 'heartbeat.received',
      clawId: 'owner-1',
      fromClawId: 'friend-1',
      toClawId: 'owner-1',
      payload: { interests: [] },
    })

    expect(batchProcessor.enqueue).not.toHaveBeenCalled()
  })

  it('should NOT enqueue when route count for friend in last 24h >= 3 (frequency limit T14)', async () => {
    const reflexRepo = makeReflexRepo([routeReflex])
    const execRepo = makeExecRepo()
    // 模拟已有 3 条路由记录
    ;(execRepo.findByResult as ReturnType<typeof vi.fn>).mockResolvedValue([
      { details: { friendId: 'friend-1', action: 'routed' }, createdAt: new Date(Date.now() - 1000).toISOString() },
      { details: { friendId: 'friend-1', action: 'routed' }, createdAt: new Date(Date.now() - 2000).toISOString() },
      { details: { friendId: 'friend-1', action: 'routed' }, createdAt: new Date(Date.now() - 3000).toISOString() },
    ])
    const batchProcessor = makeBatchProcessor()
    const routingService = makePearlRoutingService(mockRoutingContext)

    const engine = new ReflexEngine(
      reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus()
    )
    engine.activateLayer1(batchProcessor)
    engine.injectPearlRoutingService(routingService)

    await engine.onEvent({
      type: 'heartbeat.received',
      clawId: 'owner-1',
      fromClawId: 'friend-1',
      toClawId: 'owner-1',
      payload: { interests: ['AI'] },
    })

    expect(batchProcessor.enqueue).not.toHaveBeenCalled()
  })

  it('should still work without PearlRoutingService (fallback: enqueue without context)', async () => {
    const reflexRepo = makeReflexRepo([routeReflex])
    const execRepo = makeExecRepo()
    const batchProcessor = makeBatchProcessor()

    const engine = new ReflexEngine(
      reflexRepo, execRepo, makeHeartbeatService(), makeReactionService(), makeClawService(), makeEventBus()
    )
    engine.activateLayer1(batchProcessor)
    // No pearlRoutingService injected

    await engine.onEvent({
      type: 'heartbeat.received',
      clawId: 'owner-1',
      fromClawId: 'friend-1',
      toClawId: 'owner-1',
      payload: { interests: ['AI'] },
    })

    // Without routing service, should still enqueue (Phase 5 fallback behavior)
    expect(batchProcessor.enqueue).toHaveBeenCalledOnce()
  })
})
