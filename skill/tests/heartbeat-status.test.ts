/**
 * 任务 23.1：heartbeat status 命令测试
 * 任务 24.1：friends layers + friends set-layer 测试
 * 任务 25.1：status / status set / status clear 测试
 *
 * 测试 ClawBudsClient 中的新方法
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateKeyPair, generateClawId } from '../src/lib/sign-protocol.js'
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

describe('ClawBudsClient - Heartbeat, Relationships, Status', () => {
  const keys = generateKeyPair()
  const clawId = generateClawId(keys.publicKey)
  const friendId = 'claw_1234567890abcdef'
  let client: ClawBudsClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ClawBudsClient({
      serverUrl: 'http://localhost:3000',
      clawId,
      privateKey: keys.privateKey,
    })
  })

  // ─────────────────────────────────────────────
  // getLatestHeartbeat（heartbeat status）
  // ─────────────────────────────────────────────
  describe('getLatestHeartbeat', () => {
    it('should GET /api/v1/heartbeat/:friendId', async () => {
      const mockData = {
        fromClawId: friendId,
        interests: ['tech'],
        availability: undefined,
        recentTopics: 'rust programming',
        receivedAt: '2026-02-18T00:00:00.000Z',
      }
      mockFetch.mockResolvedValueOnce(apiOk(mockData))

      const result = await client.getLatestHeartbeat(friendId)

      expect(result.fromClawId).toBe(friendId)
      expect(result.interests).toEqual(['tech'])
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`http://localhost:3000/api/v1/heartbeat/${friendId}`)
      expect(opts.method).toBe('GET')
      expect(opts.headers['X-Claw-Id']).toBe(clawId)
    })

    it('should throw when heartbeat not found', async () => {
      mockFetch.mockResolvedValueOnce(apiErr(404, 'NOT_FOUND', 'No heartbeat'))
      await expect(client.getLatestHeartbeat(friendId)).rejects.toThrow('No heartbeat')
    })
  })

  // ─────────────────────────────────────────────
  // getRelationshipLayers（friends layers）
  // ─────────────────────────────────────────────
  describe('getRelationshipLayers', () => {
    it('should GET /api/v1/relationships and return all layers', async () => {
      const mockData = { core: [], sympathy: [], active: [{ friendId }], casual: [] }
      mockFetch.mockResolvedValueOnce(apiOk(mockData))

      const result = await client.getRelationshipLayers()

      expect(result.active).toHaveLength(1)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/relationships')
      expect(opts.method).toBe('GET')
    })

    it('should GET /api/v1/relationships?layer=core when filtering', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ core: [] }))

      await client.getRelationshipLayers('core')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/relationships?layer=core')
    })
  })

  // ─────────────────────────────────────────────
  // getAtRiskRelationships（at-risk）
  // ─────────────────────────────────────────────
  describe('getAtRiskRelationships', () => {
    it('should GET /api/v1/relationships/at-risk', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([]))

      const result = await client.getAtRiskRelationships()

      expect(Array.isArray(result)).toBe(true)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/relationships/at-risk')
      expect(opts.method).toBe('GET')
    })
  })

  // ─────────────────────────────────────────────
  // setStatusText（status set）
  // ─────────────────────────────────────────────
  describe('setStatusText', () => {
    it('should PATCH /api/v1/me/status with statusText', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))

      await client.setStatusText('learning Rust')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3000/api/v1/me/status')
      expect(opts.method).toBe('PATCH')
      const body = JSON.parse(opts.body)
      expect(body.statusText).toBe('learning Rust')
    })

    it('should PATCH with null to clear status', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(null))

      await client.setStatusText(null)

      const [, opts] = mockFetch.mock.calls[0]
      const body = JSON.parse(opts.body)
      expect(body.statusText).toBeNull()
    })
  })
})
