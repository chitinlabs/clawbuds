/**
 * T18.1: friend-model 命令测试（TDD 红灯）
 * 测试 ClawBudsClient 中的 getFriendModel / getAllFriendModels 方法
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

function apiErr(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code, message } }),
  }
}

describe('ClawBudsClient - Friend Model (Phase 2)', () => {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  const friendId = 'claw_1234567890abcdef'
  let client: ClawBudsClient

  const mockModel = {
    friendId,
    lastKnownState: '最近在研究 Rust 异步模型',
    inferredInterests: ['Rust', 'Systems'],
    expertiseTags: { Rust: 0.85, Systems: 0.6 },
    lastHeartbeatAt: '2026-02-18T10:00:00.000Z',
    lastInteractionAt: '2026-02-17T15:30:00.000Z',
    emotionalTone: null,
    inferredNeeds: null,
    knowledgeGaps: null,
    updatedAt: '2026-02-18T10:00:00.000Z',
  }

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ClawBudsClient({
      serverUrl: 'http://localhost:3000',
      clawId,
      privateKey: keys.privateKey,
    })
  })

  // ─────────────────────────────────────────────
  // getFriendModel
  // ─────────────────────────────────────────────
  describe('getFriendModel', () => {
    it('should GET /api/v1/friend-models/:friendId', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(mockModel))

      const result = await client.getFriendModel(friendId)

      expect(result.friendId).toBe(friendId)
      expect(result.inferredInterests).toEqual(['Rust', 'Systems'])
      expect(result.expertiseTags).toEqual({ Rust: 0.85, Systems: 0.6 })
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`http://localhost:3000/api/v1/friend-models/${friendId}`)
      expect(opts.method).toBe('GET')
      expect(opts.headers['X-Claw-Id']).toBe(clawId)
    })

    it('should throw 403 when not friends', async () => {
      mockFetch.mockResolvedValueOnce(apiErr(403, 'NOT_FRIENDS', 'Not friends'))
      await expect(client.getFriendModel(friendId)).rejects.toThrow('Not friends')
    })

    it('should throw 404 when model not found', async () => {
      mockFetch.mockResolvedValueOnce(apiErr(404, 'NOT_FOUND', 'Friend model not found'))
      await expect(client.getFriendModel(friendId)).rejects.toThrow('Friend model not found')
    })
  })

  // ─────────────────────────────────────────────
  // getAllFriendModels
  // ─────────────────────────────────────────────
  describe('getAllFriendModels', () => {
    it('should GET /api/v1/friend-models', async () => {
      const mockList = [mockModel]
      mockFetch.mockResolvedValueOnce(apiOk(mockList))

      const result = await client.getAllFriendModels()

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].friendId).toBe(friendId)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/friend-models')
      expect(opts.method).toBe('GET')
    })

    it('should return empty array when no friends have models', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([]))
      const result = await client.getAllFriendModels()
      expect(result).toEqual([])
    })
  })
})
