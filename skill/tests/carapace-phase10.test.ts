/**
 * Phase 10: carapace history/diff/restore + pattern-health + micromolt apply
 * ClawBudsClient API 方法测试（使用 mock fetch）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateKeyPair, generateClawId } from '@clawbuds/shared'
import { ClawBudsClient } from '../src/client.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function apiOk<T>(data: T, meta?: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, meta }),
  }
}

function apiError(message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code: 'ERR', message } }),
  }
}

const historyRecord = {
  id: 'hist-1',
  clawId: 'claw-a',
  version: 5,
  content: '## carapace\n内容 v5',
  changeReason: 'manual_edit',
  suggestedBy: 'user',
  createdAt: '2026-02-19T08:00:00Z',
}

describe('ClawBudsClient - Phase 10 Carapace History', () => {
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

  describe('getCarapaceHistory', () => {
    it('should call GET /api/v1/carapace/history', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([historyRecord], { total: 1, latestVersion: 5 }))
      const result = await client.getCarapaceHistory()
      expect(Array.isArray(result)).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/carapace/history'),
        expect.any(Object),
      )
    })

    it('should pass limit and offset as query params', async () => {
      mockFetch.mockResolvedValueOnce(apiOk([], { total: 0, latestVersion: 0 }))
      await client.getCarapaceHistory({ limit: 5, offset: 0 })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object),
      )
    })
  })

  describe('getCarapaceVersion', () => {
    it('should call GET /api/v1/carapace/history/:version', async () => {
      mockFetch.mockResolvedValueOnce(apiOk(historyRecord))
      const result = await client.getCarapaceVersion(5)
      expect(result).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/carapace/history/5'),
        expect.any(Object),
      )
    })

    it('should throw on 404', async () => {
      mockFetch.mockResolvedValueOnce(apiError('Version not found', 404))
      await expect(client.getCarapaceVersion(999)).rejects.toThrow()
    })
  })

  describe('restoreCarapaceVersion', () => {
    it('should call POST /api/v1/carapace/restore/:version', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ restoredVersion: 3, newVersion: 6 }))
      const result = await client.restoreCarapaceVersion(3)
      expect(result).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/carapace/restore/3'),
        expect.any(Object),
      )
    })
  })
})

describe('ClawBudsClient - Phase 10 Pattern Health', () => {
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

  describe('getPatternHealth', () => {
    it('should call GET /api/v1/pattern-health', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({
        healthScore: { overall: 0.85, reflexDiversity: 0.9, templateDiversity: 0.8, carapaceFreshness: 0.85, lastUpdated: '2026-02-21T00:00:00Z' },
        alerts: [],
      }))
      const result = await client.getPatternHealth()
      expect(result).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pattern-health'),
        expect.any(Object),
      )
    })
  })
})

describe('ClawBudsClient - Phase 10 MicroMolt Apply', () => {
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

  describe('applyMicroMoltSuggestion', () => {
    it('should call POST /api/v1/micromolt/apply', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({
        appliedSuggestion: { type: 'allow', description: 'test', cliCommand: 'test', confidence: 0.9 },
      }))
      const result = await client.applyMicroMoltSuggestion({ suggestionIndex: 0, confirmed: true })
      expect(result).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/micromolt/apply'),
        expect.any(Object),
      )
    })

    it('should throw on 400 when suggestion not found', async () => {
      mockFetch.mockResolvedValueOnce(apiError('Suggestion not found', 400))
      await expect(client.applyMicroMoltSuggestion({ suggestionIndex: 999, confirmed: true })).rejects.toThrow()
    })
  })
})
