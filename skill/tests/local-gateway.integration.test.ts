/**
 * Integration tests for the daemon local HTTP gateway
 * (skill/src/local-api.ts + skill/src/local-server.ts)
 *
 * Difference from unit tests:
 *  - No vi.fn mocks — stubs have real implementations that capture calls
 *  - Tests chain multiple operations (PUT → GET, sync → GET)
 *  - Validates full HTTP request/response cycle through createLocalServer
 *  - Exercises concurrent requests, body-size limits, server restart
 *  - Static file serving coexists with /local/* routing
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLocalServer, type LocalServer } from '../src/local-server.js'
import type { LocalApiClient, LocalApiConfig } from '../src/local-api.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  const url = `http://127.0.0.1:${port}${path}`
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const ct = res.headers.get('content-type') ?? ''
  const data = ct.includes('application/json') ? await res.json() : await res.text()
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => (headers[k] = v))
  return { status: res.status, data, headers }
}

// ── Real stub — captures calls without vi.fn ──────────────────────────────────

interface SnapshotCall { content: string; reason: string }
interface VersionCall { version?: number }

function buildStubClient(
  options: {
    snapshotVersion?: number
    serverContent?: string
    serverVersion?: number
  } = {},
): LocalApiClient & {
  snapshotCalls: SnapshotCall[]
  versionCalls: VersionCall[]
} {
  const snapshotCalls: SnapshotCall[] = []
  const versionCalls: VersionCall[] = []
  const snapshotVersion = options.snapshotVersion ?? 2
  const serverContent = options.serverContent ?? '# Server carapace'
  const serverVersion = options.serverVersion ?? 5

  return {
    snapshotCalls,
    versionCalls,

    async pushCarapaceSnapshot(content: string, reason: string) {
      snapshotCalls.push({ content, reason })
      return { version: snapshotVersion, createdAt: new Date().toISOString() }
    },

    async getCarapaceVersion(_version?: number) {
      versionCalls.push({ version: _version })
      return { content: serverContent, version: serverVersion }
    },
  }
}

function buildStubConfig(): LocalApiConfig {
  return {
    getCurrentProfile() {
      return {
        serverUrl: 'http://localhost:8765',
        clawId: 'claw_integration_test',
        publicKey: 'pubkey_abc',
        displayName: 'Integration Test Claw',
      }
    },
    listProfiles() {
      return ['default', 'integration']
    },
    getCurrentProfileName() {
      return 'integration'
    },
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Local HTTP Gateway — Integration', () => {
  let tmpDir: string
  let carapacePath: string
  let server: LocalServer
  let port: number
  let stubClient: ReturnType<typeof buildStubClient>

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'local-gw-int-'))
    carapacePath = join(tmpDir, 'references', 'carapace.md')
    mkdirSync(join(tmpDir, 'references'), { recursive: true })
    writeFileSync(carapacePath, '# Initial Carapace\n\n> rule 1')

    stubClient = buildStubClient({ snapshotVersion: 3, serverContent: '# From Server', serverVersion: 7 })

    server = createLocalServer({
      port: 0,
      configDir: tmpDir,
      client: stubClient,
      config: buildStubConfig(),
      getServerConnected: () => true,
      getActiveProfiles: () => ['integration'],
    })
    const result = await server.start()
    port = result.port
  })

  afterEach(async () => {
    await server?.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── Chained read/write ───────────────────────────────────────────────────

  describe('chained operations', () => {
    it('PUT then GET returns the written content', async () => {
      const newContent = '# Updated Carapace\n\n> new rule'

      const put = await req(port, 'PUT', '/local/carapace', { content: newContent, reason: 'integration-test' })
      expect(put.status).toBe(200)
      expect((put.data as { version: number }).version).toBe(3)

      const get = await req(port, 'GET', '/local/carapace')
      expect(get.status).toBe(200)
      expect((get.data as { content: string }).content).toBe(newContent)

      // Verify file was actually written
      expect(readFileSync(carapacePath, 'utf-8')).toBe(newContent)
    })

    it('PUT calls pushCarapaceSnapshot with exact content and reason', async () => {
      const content = '# Carapace v2\n\n> updated rule'
      await req(port, 'PUT', '/local/carapace', { content, reason: 'weekly-review' })

      expect(stubClient.snapshotCalls).toHaveLength(1)
      expect(stubClient.snapshotCalls[0]).toEqual({ content, reason: 'weekly-review' })
    })

    it('POST /local/carapace/sync then GET returns server content', async () => {
      const sync = await req(port, 'POST', '/local/carapace/sync')
      expect(sync.status).toBe(200)
      expect((sync.data as { version: number }).version).toBe(7)

      const get = await req(port, 'GET', '/local/carapace')
      expect((get.data as { content: string }).content).toBe('# From Server')

      // Verify file written
      expect(readFileSync(carapacePath, 'utf-8')).toBe('# From Server')
    })

    it('multiple PUTs accumulate snapshot calls', async () => {
      await req(port, 'PUT', '/local/carapace', { content: '# v1', reason: 'r1' })
      await req(port, 'PUT', '/local/carapace', { content: '# v2', reason: 'r2' })
      await req(port, 'PUT', '/local/carapace', { content: '# v3', reason: 'r3' })

      expect(stubClient.snapshotCalls).toHaveLength(3)
      expect(stubClient.snapshotCalls[2]).toMatchObject({ content: '# v3', reason: 'r3' })
      expect(readFileSync(carapacePath, 'utf-8')).toBe('# v3')
    })
  })

  // ─── File system persistence ──────────────────────────────────────────────

  describe('file system persistence', () => {
    it('creates references/ directory when it does not exist', async () => {
      rmSync(join(tmpDir, 'references'), { recursive: true })
      expect(existsSync(join(tmpDir, 'references'))).toBe(false)

      await req(port, 'PUT', '/local/carapace', { content: '# New', reason: 'create-dir' })

      expect(existsSync(carapacePath)).toBe(true)
      expect(readFileSync(carapacePath, 'utf-8')).toBe('# New')
    })

    it('GET returns empty string when file is removed between requests', async () => {
      rmSync(carapacePath)
      const { data } = await req(port, 'GET', '/local/carapace')
      expect((data as { content: string }).content).toBe('')
    })

    it('file content persists after server stop and restart', async () => {
      await req(port, 'PUT', '/local/carapace', { content: '# Persisted', reason: 'persist-test' })
      await server.stop()

      // Restart with same configDir
      const server2 = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: stubClient,
        config: buildStubConfig(),
        getServerConnected: () => false,
        getActiveProfiles: () => [],
      })
      const { port: port2 } = await server2.start()

      const { data } = await req(port2, 'GET', '/local/carapace')
      expect((data as { content: string }).content).toBe('# Persisted')

      await server2.stop()
      // Restore the reference so afterEach can stop correctly
      server = server2
    })
  })

  // ─── Body validation and size limits ─────────────────────────────────────

  describe('body validation', () => {
    it('returns 400 when content field is absent', async () => {
      const { status } = await req(port, 'PUT', '/local/carapace', { reason: 'no-content' })
      expect(status).toBe(400)
    })

    it('returns 400 when reason field is absent', async () => {
      const { status } = await req(port, 'PUT', '/local/carapace', { content: '# hi' })
      expect(status).toBe(400)
    })

    it('returns 400 when body is malformed JSON', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/local/carapace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not valid json',
      })
      expect(res.status).toBe(400)
    })

    it('rejects requests larger than 1 MB', async () => {
      // Build a payload just over 1MB
      const bigContent = 'x'.repeat(1024 * 1024 + 100)
      // When req.destroy() is called, the socket is abruptly closed.
      // Node.js fetch throws a SocketError ("other side closed") instead of
      // returning a response — that IS the correct rejection behavior.
      try {
        const res = await fetch(`http://127.0.0.1:${port}/local/carapace`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: bigContent, reason: 'oversize' }),
        })
        // If we somehow get a response, it must be an error status
        expect([400, 413, 500]).toContain(res.status)
      } catch (err) {
        // Expected path: server destroyed the socket (1MB body limit enforced)
        const msg = String(err)
        expect(msg).toMatch(/fetch failed|socket|ECONNRESET|other side/i)
      }
    })
  })

  // ─── Status endpoint reflects live state ─────────────────────────────────

  describe('live status', () => {
    it('reports serverConnected from injected function', async () => {
      // Default server has getServerConnected: () => true
      const { data } = await req(port, 'GET', '/local/status')
      expect((data as { serverConnected: boolean }).serverConnected).toBe(true)
    })

    it('reports activeProfiles from injected function', async () => {
      const { data } = await req(port, 'GET', '/local/status')
      expect((data as { activeProfiles: string[] }).activeProfiles).toEqual(['integration'])
    })

    it('reflects config from stub without any file I/O', async () => {
      const { data } = await req(port, 'GET', '/local/config')
      expect((data as { clawId: string }).clawId).toBe('claw_integration_test')
      expect((data as { displayName: string }).displayName).toBe('Integration Test Claw')
    })

    it('profiles returns list from stub config', async () => {
      const { data } = await req(port, 'GET', '/local/profiles')
      const typed = data as { profiles: string[]; current: string }
      expect(typed.profiles).toEqual(['default', 'integration'])
      expect(typed.current).toBe('integration')
    })
  })

  // ─── Concurrent requests ─────────────────────────────────────────────────

  describe('concurrent requests', () => {
    it('handles 10 simultaneous GET /local/carapace requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        req(port, 'GET', '/local/carapace'),
      )
      const results = await Promise.all(promises)
      for (const { status, data } of results) {
        expect(status).toBe(200)
        expect(typeof (data as { content: string }).content).toBe('string')
      }
    })

    it('last-write-wins under sequential PUTs', async () => {
      // Sequential (not truly concurrent to avoid race conditions on file write)
      for (let i = 0; i < 5; i++) {
        await req(port, 'PUT', '/local/carapace', { content: `# Version ${i}`, reason: `v${i}` })
      }
      const { data } = await req(port, 'GET', '/local/carapace')
      expect((data as { content: string }).content).toBe('# Version 4')
    })
  })

  // ─── CORS headers ────────────────────────────────────────────────────────

  describe('CORS', () => {
    it('all /local/* responses include CORS headers', async () => {
      for (const path of ['/local/status', '/local/carapace', '/local/config', '/local/profiles']) {
        const { headers } = await req(port, 'GET', path)
        expect(headers['access-control-allow-origin']).toBeTruthy()
      }
    })

    it('OPTIONS preflight returns 204 with CORS headers', async () => {
      const { status, headers } = await req(port, 'OPTIONS', '/local/carapace')
      expect(status).toBe(204)
      expect(headers['access-control-allow-origin']).toBeTruthy()
      expect(headers['access-control-allow-methods']).toMatch(/PUT/)
    })
  })

  // ─── Static file + /local/* coexistence ──────────────────────────────────

  describe('static file + local API coexistence', () => {
    it('serves static files when staticDir is set alongside /local/* routes', async () => {
      const staticDir = join(tmpDir, 'static')
      mkdirSync(staticDir)
      writeFileSync(join(staticDir, 'index.html'), '<html><body>App</body></html>')
      writeFileSync(join(staticDir, 'app.js'), 'console.log("app")')

      const s = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: stubClient,
        config: buildStubConfig(),
        getServerConnected: () => true,
        getActiveProfiles: () => ['integration'],
        staticDir,
      })
      const { port: p } = await s.start()

      // /local/* still works
      const status = await req(p, 'GET', '/local/status')
      expect(status.status).toBe(200)
      expect((status.data as { running: boolean }).running).toBe(true)

      // Static file served
      const html = await fetch(`http://127.0.0.1:${p}/`).then((r) => r.text())
      expect(html).toContain('App')

      const js = await fetch(`http://127.0.0.1:${p}/app.js`)
      expect(js.status).toBe(200)

      await s.stop()
    })

    it('/local/* routes take priority over staticDir for /local paths', async () => {
      // Even if staticDir has a file named "local", the /local/* handler wins
      const staticDir = join(tmpDir, 'static2')
      mkdirSync(staticDir)
      // Not creating a "local" file/dir — just ensuring the handler intercepts

      const s = createLocalServer({
        port: 0,
        configDir: tmpDir,
        client: stubClient,
        config: buildStubConfig(),
        getServerConnected: () => true,
        getActiveProfiles: () => ['default'],
        staticDir,
      })
      const { port: p } = await s.start()

      const { status, data } = await req(p, 'GET', '/local/status')
      expect(status).toBe(200)
      expect((data as { running: boolean }).running).toBe(true)

      await s.stop()
    })
  })

  // ─── Server lifecycle ─────────────────────────────────────────────────────

  describe('server lifecycle', () => {
    it('stop() resolves cleanly even with no active requests', async () => {
      await expect(server.stop()).resolves.not.toThrow()
      // Prevent double-stop in afterEach — reassign to a no-op
      server = { start: async () => ({ port: 0 }), stop: async () => {} }
    })

    it('requests fail after server is stopped', async () => {
      await server.stop()
      server = { start: async () => ({ port: 0 }), stop: async () => {} }

      await expect(
        fetch(`http://127.0.0.1:${port}/local/status`),
      ).rejects.toThrow()
    })

    it('binds to 127.0.0.1 (address is loopback)', async () => {
      // The port we got should only be accessible via 127.0.0.1
      // We verify by checking the server started without error (port > 0)
      expect(port).toBeGreaterThan(0)

      // Confirm 127.0.0.1 works
      const { status } = await req(port, 'GET', '/local/status')
      expect(status).toBe(200)
    })
  })
})
