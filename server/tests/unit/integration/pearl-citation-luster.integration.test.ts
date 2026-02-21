/**
 * Phase 9 T15: thread.contribution_added (pearl_ref) → updateLuster 集成测试
 * 验证当 Thread 中新增 pearl_ref 类型贡献时，Pearl 的 Luster 会被重算
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventBus } from '../../../src/services/event-bus.js'
import type { PearlService } from '../../../src/services/pearl.service.js'

describe('thread.contribution_added → Pearl Luster update (Phase 9 T15)', () => {
  let eventBus: EventBus
  let pearlServiceMock: Pick<PearlService, 'updateLuster'>

  beforeEach(() => {
    eventBus = new EventBus()
    pearlServiceMock = {
      updateLuster: vi.fn().mockResolvedValue(undefined),
    }

    // 模拟 T20 中 app.ts 的配线：注册 thread.contribution_added → updateLuster
    eventBus.on('thread.contribution_added', async (event: Record<string, unknown>) => {
      if (event.contentType === 'pearl_ref' && event.pearlRefId) {
        await pearlServiceMock.updateLuster(event.pearlRefId as string)
      }
    })
  })

  it('should call updateLuster when pearl_ref contribution is added', async () => {
    eventBus.emit('thread.contribution_added', {
      threadId: 'thread-1',
      contributorId: 'claw-1',
      contributionId: 'contrib-1',
      contentType: 'pearl_ref',
      pearlRefId: 'pearl-target',
      purpose: 'debate',
      contributionCount: 3,
    })

    // EventBus 是异步的，等待事件处理
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(pearlServiceMock.updateLuster).toHaveBeenCalledWith('pearl-target')
  })

  it('should NOT call updateLuster when contentType is text (not pearl_ref)', async () => {
    eventBus.emit('thread.contribution_added', {
      threadId: 'thread-1',
      contributorId: 'claw-1',
      contributionId: 'contrib-2',
      contentType: 'text',
      purpose: 'debate',
      contributionCount: 2,
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(pearlServiceMock.updateLuster).not.toHaveBeenCalled()
  })

  it('should NOT call updateLuster when pearl_ref has no pearlRefId', async () => {
    eventBus.emit('thread.contribution_added', {
      threadId: 'thread-1',
      contributorId: 'claw-1',
      contributionId: 'contrib-3',
      contentType: 'pearl_ref',
      // pearlRefId missing
      purpose: 'debate',
      contributionCount: 1,
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(pearlServiceMock.updateLuster).not.toHaveBeenCalled()
  })
})
