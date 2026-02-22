/**
 * TDD tests for skill/src/local-api.ts
 * Phase 13a: Daemon local HTTP API
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Will be implemented in skill/src/local-api.ts
import { createLocalApiHandler } from '../src/local-api.js'

// Helper: HTTP client for test requests
async function request(
  server: Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const url = `http://127.0.0.1:${port}${path}`

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json') ? await res.json() : await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })
  return { status: res.status, data, headers }
}

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  return new Promise((resolve) => {
    const s = createServer(handler)
    s.listen(0, '127.0.0.1', () => resolve(s))
  })
}

describe('Local API Handler', () => {
  let tmpDir: string
  let carapaceDir: string
  let carapacePath: string
  let server: Server
  let mockClient: {
    pushCarapaceSnapshot: ReturnType<typeof vi.fn>
    getCarapaceVersion: ReturnType<typeof vi.fn>
  }
  let mockConfig: {
    getCurrentProfile: ReturnType<typeof vi.fn>
    listProfiles: ReturnType<typeof vi.fn>
    getCurrentProfileName: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'local-api-test-'))
    carapaceDir = join(tmpDir, 'references')
    mkdirSync(carapaceDir, { recursive: true })
    carapacePath = join(carapaceDir, 'carapace.md')
    writeFileSync(carapacePath, '# Carapace\n\n> Test content')

    mockClient = {
      pushCarapaceSnapshot: vi.fn().mockResolvedValue({ version: 2, createdAt: '2026-02-22T01:00:00Z' }),
      getCarapaceVersion: vi.fn().mockResolvedValue({ content: '# Server version', version: 5 }),
    }

    mockConfig = {
      getCurrentProfile: vi.fn().mockReturnValue({
        serverUrl: 'http://localhost:8765',
        clawId: 'claw_test',
        publicKey: 'abc123',
        displayName: 'Test Claw',
      }),
      listProfiles: vi.fn().mockReturnValue(['default', 'work']),
      getCurrentProfileName: vi.fn().mockReturnValue('default'),
    }

    const handler = createLocalApiHandler({
      configDir: tmpDir,
      client: mockClient as never,
      config: mockConfig as never,
      getServerConnected: () => true,
      getActiveProfiles: () => ['default'],
    })

    server = await startServer(handler)
  })

  afterEach(() => {
    server?.close()
    rmSync(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  // ─── GET /local/status ────────────────────────────────────────────────────

  describe('GET /local/status', () => {
    it('should return daemon running status', async () => {
      const { status, data } = await request(server, 'GET', '/local/status')
      expect(status).toBe(200)
      expect((data as { running: boolean }).running).toBe(true)
      expect((data as { serverConnected: boolean }).serverConnected).toBe(true)
      expect((data as { activeProfiles: string[] }).activeProfiles).toEqual(['default'])
    })

    it('should include CORS headers', async () => {
      const { headers } = await request(server, 'GET', '/local/status')
      expect(headers['access-control-allow-origin']).toBeTruthy()
    })
  })

  // ─── GET /local/carapace ──────────────────────────────────────────────────

  describe('GET /local/carapace', () => {
    it('should return local carapace.md content', async () => {
      const { status, data } = await request(server, 'GET', '/local/carapace')
      expect(status).toBe(200)
      expect((data as { content: string }).content).toBe('# Carapace\n\n> Test content')
    })

    it('should return empty string when carapace.md does not exist', async () => {
      rmSync(carapacePath)
      const { status, data } = await request(server, 'GET', '/local/carapace')
      expect(status).toBe(200)
      expect((data as { content: string }).content).toBe('')
    })
  })

  // ─── PUT /local/carapace ──────────────────────────────────────────────────

  describe('PUT /local/carapace', () => {
    it('should write content to local file and push snapshot', async () => {
      const newContent = '# Updated\n\n> New rule'
      const { status, data } = await request(server, 'PUT', '/local/carapace', {
        content: newContent,
        reason: 'manual',
      })
      expect(status).toBe(200)
      expect((data as { version: number }).version).toBe(2)
      expect(readFileSync(carapacePath, 'utf-8')).toBe(newContent)
      expect(mockClient.pushCarapaceSnapshot).toHaveBeenCalledWith(newContent, 'manual')
    })

    it('should return 400 when content is missing', async () => {
      const { status } = await request(server, 'PUT', '/local/carapace', { reason: 'manual' })
      expect(status).toBe(400)
    })

    it('should return 400 when reason is missing', async () => {
      const { status } = await request(server, 'PUT', '/local/carapace', { content: 'test' })
      expect(status).toBe(400)
    })

    it('should create directory if it does not exist', async () => {
      rmSync(carapaceDir, { recursive: true })
      const { status } = await request(server, 'PUT', '/local/carapace', {
        content: '# New',
        reason: 'manual',
      })
      expect(status).toBe(200)
      expect(existsSync(carapacePath)).toBe(true)
    })
  })

  // ─── POST /local/carapace/sync ────────────────────────────────────────────

  describe('POST /local/carapace/sync', () => {
    it('should fetch latest version from server and write to local file', async () => {
      const { status, data } = await request(server, 'POST', '/local/carapace/sync')
      expect(status).toBe(200)
      expect((data as { version: number }).version).toBe(5)
      expect(readFileSync(carapacePath, 'utf-8')).toBe('# Server version')
    })
  })

  // ─── GET /local/config ────────────────────────────────────────────────────

  describe('GET /local/config', () => {
    it('should return current profile config', async () => {
      const { status, data } = await request(server, 'GET', '/local/config')
      expect(status).toBe(200)
      const profile = data as { serverUrl: string; clawId: string; displayName: string }
      expect(profile.serverUrl).toBe('http://localhost:8765')
      expect(profile.clawId).toBe('claw_test')
      expect(profile.displayName).toBe('Test Claw')
    })
  })

  // ─── GET /local/profiles ──────────────────────────────────────────────────

  describe('GET /local/profiles', () => {
    it('should return all profile names', async () => {
      const { status, data } = await request(server, 'GET', '/local/profiles')
      expect(status).toBe(200)
      expect((data as { profiles: string[]; current: string }).profiles).toEqual(['default', 'work'])
      expect((data as { profiles: string[]; current: string }).current).toBe('default')
    })
  })

  // ─── 404 ──────────────────────────────────────────────────────────────────

  describe('unknown routes', () => {
    it('should return 404 for unknown local API paths', async () => {
      const { status } = await request(server, 'GET', '/local/unknown-endpoint')
      expect(status).toBe(404)
    })
  })

  // ─── OPTIONS (CORS preflight) ─────────────────────────────────────────────

  describe('CORS preflight', () => {
    it('should respond to OPTIONS with 204', async () => {
      const { status } = await request(server, 'OPTIONS', '/local/status')
      expect(status).toBe(204)
    })
  })
})
