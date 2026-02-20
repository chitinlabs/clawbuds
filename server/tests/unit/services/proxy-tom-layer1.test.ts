/**
 * ProxyToMService Layer 1 字段更新测试（Phase 5）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProxyToMService } from '../../../src/services/proxy-tom.service.js'
import type { IFriendModelRepository } from '../../../src/db/repositories/interfaces/friend-model.repository.interface.js'

function makeMockRepo(): IFriendModelRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    updateFromHeartbeat: vi.fn().mockResolvedValue(undefined),
    touchInteraction: vi.fn().mockResolvedValue(undefined),
    updateLayer1Fields: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as IFriendModelRepository
}

describe('ProxyToMService.updateLayer1Fields() (Phase 5)', () => {
  let service: ProxyToMService
  let mockRepo: IFriendModelRepository

  beforeEach(() => {
    mockRepo = makeMockRepo()
    service = new ProxyToMService(mockRepo, { on: vi.fn(), emit: vi.fn() } as any)
  })

  it('should call repo.updateLayer1Fields with emotionalTone', async () => {
    const updateSpy = mockRepo.updateLayer1Fields as ReturnType<typeof vi.fn>
    await service.updateLayer1Fields('claw-a', 'friend-1', { emotionalTone: '积极' })
    expect(updateSpy).toHaveBeenCalledOnce()
    const [clawId, friendId, data] = updateSpy.mock.calls[0]
    expect(clawId).toBe('claw-a')
    expect(friendId).toBe('friend-1')
    expect(data.emotionalTone).toBe('积极')
  })

  it('should call repo.updateLayer1Fields with inferredNeeds', async () => {
    const updateSpy = mockRepo.updateLayer1Fields as ReturnType<typeof vi.fn>
    await service.updateLayer1Fields('claw-a', 'friend-1', {
      inferredNeeds: ['需要鼓励', '寻找技术建议'],
    })
    expect(updateSpy).toHaveBeenCalledOnce()
    const [, , data] = updateSpy.mock.calls[0]
    expect(data.inferredNeeds).toEqual(['需要鼓励', '寻找技术建议'])
  })

  it('should call repo.updateLayer1Fields with knowledgeGaps', async () => {
    const updateSpy = mockRepo.updateLayer1Fields as ReturnType<typeof vi.fn>
    await service.updateLayer1Fields('claw-a', 'friend-1', {
      knowledgeGaps: ['对DeFi不熟悉'],
    })
    expect(updateSpy).toHaveBeenCalledOnce()
    const [, , data] = updateSpy.mock.calls[0]
    expect(data.knowledgeGaps).toEqual(['对DeFi不熟悉'])
  })
})
