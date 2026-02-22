/**
 * TDD tests for skill/src/local-server.ts
 * Phase 13a: Daemon local HTTP server
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Will be implemented in skill/src/local-server.ts
import { createLocalServer, type LocalServer } from '../src/local-server.js'

async function get(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, data: await res.text() }
}

describe('Local Server', () => {
  let tmpDir: string
  let server: LocalServer

  const mockClient = {
    pushCarapaceSnapshot: vi.fn().mockResolvedValue({ version: 1, createdAt: '2026-02-22T00:00:00Z' }),
    getCarapaceVersion: vi.fn().mockResolvedValue({ content: '# test', version: 1 }),
  }

  const mockConfig = {
    getCurrentProfile: vi.fn().mockReturnValue({
      serverUrl: 'http://localhost:8765',
      clawId: 'claw_test',
      publicKey: 'abc',
      displayName: 'Test',
    }),
    listProfiles: vi.fn().mockReturnValue(['default']),
    getCurrentProfileName: vi.fn().mockReturnValue('default'),
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'local-server-test-'))
  })

  afterEach(async () => {
    await server?.stop()
    rmSync(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  // ─── start / stop ─────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should start and return an assigned port', async () => {
      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
      })
      const { port } = await server.start()
      expect(port).toBeGreaterThan(0)
    })

    it('should stop cleanly without error', async () => {
      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
      })
      await server.start()
      await expect(server.stop()).resolves.not.toThrow()
    })
  })

  // ─── local API routing ────────────────────────────────────────────────────

  describe('local API routing', () => {
    it('should forward /local/status to the local-api handler', async () => {
      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => true,
        getActiveProfiles: () => ['default'],
      })
      const { port } = await server.start()
      const { status, data } = await get(port, '/local/status')
      expect(status).toBe(200)
      const parsed = JSON.parse(data) as { running: boolean }
      expect(parsed.running).toBe(true)
    })

    it('should return 404 for unknown /local/* routes', async () => {
      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
      })
      const { port } = await server.start()
      const { status } = await get(port, '/local/nonexistent')
      expect(status).toBe(404)
    })
  })

  // ─── static file serving ──────────────────────────────────────────────────

  describe('static file serving', () => {
    it('should serve index.html for SPA root when staticDir is set', async () => {
      // Write a minimal index.html in staticDir
      writeFileSync(join(tmpDir, 'index.html'), '<html><body>SPA</body></html>')

      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
        staticDir: tmpDir,
      })
      const { port } = await server.start()
      const res = await fetch(`http://127.0.0.1:${port}/`)
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toContain('SPA')
    })

    it('should serve a specific static file when staticDir is set', async () => {
      writeFileSync(join(tmpDir, 'app.js'), 'console.log("app")')

      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
        staticDir: tmpDir,
      })
      const { port } = await server.start()
      const res = await fetch(`http://127.0.0.1:${port}/app.js`)
      expect(res.status).toBe(200)
    })

    it('should return 404 for unknown paths when no staticDir', async () => {
      server = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: mockClient as never,
        config: mockConfig as never,
        getServerConnected: () => false,
        getActiveProfiles: () => [],
        // no staticDir
      })
      const { port } = await server.start()
      const { status } = await get(port, '/index.html')
      expect(status).toBe(404)
    })
  })
})
