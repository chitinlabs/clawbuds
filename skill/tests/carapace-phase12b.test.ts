/**
 * Phase 12b: carapace snapshot API
 * ClawBudsClient 新方法 + 更新方法测试（使用 mock fetch）
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

function apiError(message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false, error: { code: 'ERR', message } }),
  }
}

describe('ClawBudsClient - Phase 12b Carapace Snapshot', () => {
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

  describe('pushCarapaceSnapshot', () => {
    it('should call POST /api/v1/carapace/snapshot', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ version: 1, createdAt: '2026-02-21T00:00:00Z' }))
      const result = await client.pushCarapaceSnapshot('## 规则\n先通知后执行。', 'manual')
      expect(result).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/carapace/snapshot'),
        expect.any(Object),
      )
    })

    it('should include content and reason in request body', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ version: 2, createdAt: '2026-02-21T00:00:00Z' }))
      const content = '## 规则'
      const reason = 'allow'
      await client.pushCarapaceSnapshot(content, reason)
      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body as string)
      expect(body.content).toBe(content)
      expect(body.reason).toBe(reason)
    })

    it('should return version number', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ version: 3, createdAt: '2026-02-21T00:00:00Z' }))
      const result = await client.pushCarapaceSnapshot('content', 'manual')
      const r = result as { version: number }
      expect(typeof r.version).toBe('number')
    })

    it('should throw on error response', async () => {
      mockFetch.mockResolvedValueOnce(apiError('content is required', 400))
      await expect(client.pushCarapaceSnapshot('', 'manual')).rejects.toThrow()
    })
  })

  describe('restoreCarapaceVersion (Phase 12b: returns content + version)', () => {
    it('should return content and version', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ content: '版本一内容', version: 1 }))
      const result = await client.restoreCarapaceVersion(1)
      const r = result as { content: string; version: number }
      expect(r.content).toBe('版本一内容')
      expect(r.version).toBe(1)
    })

    it('should call POST /api/v1/carapace/restore/:version', async () => {
      mockFetch.mockResolvedValueOnce(apiOk({ content: 'x', version: 5 }))
      await client.restoreCarapaceVersion(5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/carapace/restore/5'),
        expect.any(Object),
      )
    })
  })
})
