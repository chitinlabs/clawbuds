/**
 * Phase 9 T18-T19: pearl route-stats / pearl luster CLI 命令测试
 * 使用现有 API 端点（Phase 9 不新增 API 端点）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateKeyPair, generateClawId } from '@clawbuds/shared'
import { ClawBudsClient } from '../src/client.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function apiOk<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  }
}

describe('ClawBudsClient - Phase 9 Pearl Route Stats + Luster', () => {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  let client: ClawBudsClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ClawBudsClient({
      serverUrl: 'http://localhost:8080',
      clawId,
      privateKey: keys.privateKey,
    })
  })

  describe('listPearls (existing, used by route-stats T18)', () => {
    it('should call GET /api/v1/pearls with routing candidate query', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([{
        id: 'p1', luster: 0.87, triggerText: '小模型优势', domainTags: ['AI'], shareability: 'friends_only',
      }]))
      const pearls = await client.listPearls({ shareability: 'friends_only' })
      expect(Array.isArray(pearls)).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pearls'),
        expect.any(Object),
      )
    })
  })

  describe('getReceivedPearls (existing, used by route-stats T18)', () => {
    it('should call GET /api/v1/pearls/received', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([{
        share: { fromClawId: 'friend-1', createdAt: '2026-02-21T' },
        pearl: { id: 'p2', triggerText: '系统思维', luster: 0.82 },
      }]))
      const received = await client.getReceivedPearls({ limit: 20 })
      expect(Array.isArray(received)).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pearls/received'),
        expect.any(Object),
      )
    })
  })

  describe('viewPearl (existing, used by pearl luster T19)', () => {
    it('should call GET /api/v1/pearls/:id and return luster', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({
        id: 'pearl-1',
        luster: 0.87,
        triggerText: '小模型在垂直场景的优势',
        domainTags: ['AI'],
        shareability: 'friends_only',
        shareConditions: null,
      }))
      const pearl = await client.viewPearl('pearl-1', 1)
      expect(pearl).toBeTruthy()
      expect((pearl as Record<string, unknown>).luster).toBe(0.87)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pearls/pearl-1'),
        expect.any(Object),
      )
    })
  })
})
