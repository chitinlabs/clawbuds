/**
 * IPearlRepository 接口形状验证
 * 验证接口文件存在且导出正确的类型
 */

import { describe, it, expect } from 'vitest'
// 导入接口类型（若文件不存在，此 import 将导致红灯）
import type {
  IPearlRepository,
  IPearlEndorsementRepository,
  PearlMetadataRecord,
  PearlContentRecord,
  PearlFullRecord,
  PearlReferenceRecord,
  PearlEndorsementRecord,
  CreatePearlData,
  UpdatePearlData,
  PearlFilters,
  PearlType,
  PearlShareability,
  PearlOriginType,
} from '../../../../src/db/repositories/interfaces/pearl.repository.interface.js'

describe('IPearlRepository interface shape', () => {
  it('should export PearlType union', () => {
    // PearlType 合法值的编译时校验
    const types: PearlType[] = ['insight', 'framework', 'experience']
    expect(types).toHaveLength(3)
  })

  it('should export PearlShareability union', () => {
    const shareabilities: PearlShareability[] = ['private', 'friends_only', 'public']
    expect(shareabilities).toHaveLength(3)
  })

  it('should export PearlOriginType union', () => {
    const originTypes: PearlOriginType[] = ['manual', 'conversation', 'observation']
    expect(originTypes).toHaveLength(3)
  })

  it('should allow creating a valid PearlMetadataRecord', () => {
    const record: PearlMetadataRecord = {
      id: 'pearl-1',
      ownerId: 'claw-1',
      type: 'insight',
      triggerText: 'test trigger',
      domainTags: ['AI', 'design'],
      luster: 0.5,
      shareability: 'friends_only',
      shareConditions: null,
      createdAt: '2026-02-19T00:00:00.000Z',
      updatedAt: '2026-02-19T00:00:00.000Z',
    }
    expect(record.id).toBe('pearl-1')
    expect(record.luster).toBe(0.5)
  })

  it('should allow creating a valid PearlContentRecord', () => {
    const record: PearlContentRecord = {
      id: 'pearl-1',
      ownerId: 'claw-1',
      type: 'insight',
      triggerText: 'test trigger',
      domainTags: ['AI'],
      luster: 0.5,
      shareability: 'friends_only',
      shareConditions: null,
      createdAt: '2026-02-19T00:00:00.000Z',
      updatedAt: '2026-02-19T00:00:00.000Z',
      body: 'test body',
      context: null,
      originType: 'manual',
    }
    expect(record.originType).toBe('manual')
  })

  it('should allow creating a valid PearlFullRecord', () => {
    const record: PearlFullRecord = {
      id: 'pearl-1',
      ownerId: 'claw-1',
      type: 'framework',
      triggerText: 'test trigger',
      domainTags: [],
      luster: 0.7,
      shareability: 'public',
      shareConditions: null,
      createdAt: '2026-02-19T00:00:00.000Z',
      updatedAt: '2026-02-19T00:00:00.000Z',
      body: null,
      context: null,
      originType: 'manual',
      references: [],
    }
    expect(record.references).toHaveLength(0)
  })

  it('should allow creating a valid PearlReferenceRecord', () => {
    const record: PearlReferenceRecord = {
      id: 'ref-1',
      pearlId: 'pearl-1',
      type: 'source',
      content: 'https://example.com',
      createdAt: '2026-02-19T00:00:00.000Z',
    }
    expect(record.type).toBe('source')
  })

  it('should allow creating a valid PearlEndorsementRecord', () => {
    const record: PearlEndorsementRecord = {
      id: 'end-1',
      pearlId: 'pearl-1',
      endorserClawId: 'claw-2',
      score: 0.8,
      comment: 'great insight',
      createdAt: '2026-02-19T00:00:00.000Z',
      updatedAt: '2026-02-19T00:00:00.000Z',
    }
    expect(record.score).toBe(0.8)
  })

  it('should allow creating a valid CreatePearlData', () => {
    const data: CreatePearlData = {
      id: 'pearl-1',
      ownerId: 'claw-1',
      type: 'experience',
      triggerText: 'test',
      domainTags: ['startup'],
      shareability: 'private',
      shareConditions: null,
      body: null,
      context: null,
      originType: 'manual',
    }
    expect(data.type).toBe('experience')
  })

  it('should allow creating a valid UpdatePearlData (all optional)', () => {
    const empty: UpdatePearlData = {}
    const partial: UpdatePearlData = { triggerText: 'new trigger', domainTags: ['AI'] }
    expect(Object.keys(empty)).toHaveLength(0)
    expect(partial.triggerText).toBe('new trigger')
  })

  it('should allow creating a valid PearlFilters', () => {
    const filters: PearlFilters = {
      type: 'insight',
      domain: 'AI',
      limit: 20,
      offset: 0,
    }
    expect(filters.limit).toBe(20)
  })
})

describe('IPearlRepository interface methods', () => {
  // 这些测试验证接口定义的方法签名（编译时检查）
  // 运行时不测试具体实现，实现测试在 T5/T6 中完成

  it('should define IPearlRepository type with required methods', () => {
    // 验证接口类型可作为对象类型注解使用（编译时校验）
    const mockRepo: IPearlRepository = {
      create: async () => ({} as PearlContentRecord),
      findById: async () => null,
      findByOwner: async () => [],
      update: async () => ({} as PearlContentRecord),
      updateLuster: async () => {},
      delete: async () => {},
      getPearlDomainTags: async () => [],
      getRoutingCandidates: async () => [],
      isVisibleTo: async () => false,
      addReference: async () => ({} as PearlReferenceRecord),
      removeReference: async () => {},
      getReferences: async () => [],
      createShare: async () => {},
      getReceivedPearls: async () => [],
      hasBeenSharedWith: async () => false,
    }
    expect(typeof mockRepo.create).toBe('function')
    expect(typeof mockRepo.findById).toBe('function')
    expect(typeof mockRepo.findByOwner).toBe('function')
    expect(typeof mockRepo.update).toBe('function')
    expect(typeof mockRepo.updateLuster).toBe('function')
    expect(typeof mockRepo.delete).toBe('function')
    expect(typeof mockRepo.getPearlDomainTags).toBe('function')
    expect(typeof mockRepo.getRoutingCandidates).toBe('function')
    expect(typeof mockRepo.isVisibleTo).toBe('function')
    expect(typeof mockRepo.addReference).toBe('function')
    expect(typeof mockRepo.removeReference).toBe('function')
    expect(typeof mockRepo.getReferences).toBe('function')
    expect(typeof mockRepo.createShare).toBe('function')
    expect(typeof mockRepo.getReceivedPearls).toBe('function')
    expect(typeof mockRepo.hasBeenSharedWith).toBe('function')
  })

  it('should define IPearlEndorsementRepository with required methods', () => {
    const mockRepo: IPearlEndorsementRepository = {
      upsert: async () => ({} as PearlEndorsementRecord),
      findByPearl: async () => [],
      findOne: async () => null,
      getScores: async () => [],
    }
    expect(typeof mockRepo.upsert).toBe('function')
    expect(typeof mockRepo.findByPearl).toBe('function')
    expect(typeof mockRepo.findOne).toBe('function')
    expect(typeof mockRepo.getScores).toBe('function')
  })
})
