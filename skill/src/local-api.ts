/**
 * skill/src/local-api.ts
 * Phase 13a: Daemon local HTTP API handler
 *
 * Provides /local/* endpoints for the daemon's local HTTP gateway.
 * Listens only on 127.0.0.1; never exposes to network.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Dependency-injection interfaces ──────────────────────────────────────────

export interface LocalApiClient {
  pushCarapaceSnapshot(
    content: string,
    reason: string,
  ): Promise<{ version: number; createdAt: string }>
  /** version omitted → fetch latest from server */
  getCarapaceVersion(version?: number): Promise<{ content: string; version: number }>
}

export interface LocalApiConfig {
  getCurrentProfile(): {
    serverUrl: string
    clawId: string
    publicKey: string
    displayName: string
  } | null
  /** Returns either string[] (names) or full profile objects */
  listProfiles(): string[] | Array<{ name: string }>
  getCurrentProfileName(): string | null
}

export interface LocalApiHandlerOptions {
  /** Path to the .clawbuds config directory (e.g. ~/.clawbuds) */
  configDir: string
  client: LocalApiClient
  config: LocalApiConfig
  getServerConnected: () => boolean
  getActiveProfiles: () => string[]
}

export type LocalApiHandler = (req: IncomingMessage, res: ServerResponse) => void

// ── Internal helpers ──────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(body)
}

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function carapaceFilePath(configDir: string): string {
  return join(configDir, 'references', 'carapace.md')
}

// ── Route handlers ────────────────────────────────────────────────────────────

function handleGetStatus(opts: LocalApiHandlerOptions, res: ServerResponse): void {
  sendJson(res, 200, {
    running: true,
    serverConnected: opts.getServerConnected(),
    activeProfiles: opts.getActiveProfiles(),
  })
}

function handleGetCarapace(configDir: string, res: ServerResponse): void {
  const filePath = carapaceFilePath(configDir)
  const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
  sendJson(res, 200, { content })
}

async function handlePutCarapace(
  configDir: string,
  client: LocalApiClient,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rawBody = await readBody(req)
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const body = parsed as Record<string, unknown>
  if (typeof body.content !== 'string') {
    sendJson(res, 400, { error: 'content is required and must be a string' })
    return
  }
  if (typeof body.reason !== 'string') {
    sendJson(res, 400, { error: 'reason is required and must be a string' })
    return
  }

  // Ensure directory exists before writing
  mkdirSync(join(configDir, 'references'), { recursive: true })
  writeFileSync(carapaceFilePath(configDir), body.content, 'utf-8')

  const result = await client.pushCarapaceSnapshot(body.content, body.reason)
  sendJson(res, 200, result)
}

async function handleSyncCarapace(
  configDir: string,
  client: LocalApiClient,
  res: ServerResponse,
): Promise<void> {
  // Fetch latest carapace from server (no version arg = latest)
  const result = await client.getCarapaceVersion()
  mkdirSync(join(configDir, 'references'), { recursive: true })
  writeFileSync(carapaceFilePath(configDir), result.content, 'utf-8')
  sendJson(res, 200, { version: result.version })
}

function handleGetConfig(config: LocalApiConfig, res: ServerResponse): void {
  const profile = config.getCurrentProfile()
  sendJson(res, 200, profile ?? {})
}

function handleGetProfiles(config: LocalApiConfig, res: ServerResponse): void {
  const raw = config.listProfiles()
  // Support duck-typed mocks returning string[] or full objects
  const profiles: string[] =
    raw.length > 0 && typeof raw[0] === 'string'
      ? (raw as string[])
      : (raw as Array<{ name: string }>).map((p) => p.name)

  const current = config.getCurrentProfileName() ?? ''
  sendJson(res, 200, { profiles, current })
}

// ── Main factory ──────────────────────────────────────────────────────────────

/**
 * Creates the Node.js http request handler for the daemon's local API.
 * Handles /local/* routes with CORS support for localhost web clients.
 */
export function createLocalApiHandler(opts: LocalApiHandlerOptions): LocalApiHandler {
  const { configDir, client, config } = opts

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = (req.method ?? 'GET').toUpperCase()
    const url = req.url ?? '/'

    // Strip query string for routing
    const path = url.split('?')[0]

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    // Route table
    if (method === 'GET' && path === '/local/status') {
      handleGetStatus(opts, res)
      return
    }

    if (method === 'GET' && path === '/local/carapace') {
      handleGetCarapace(configDir, res)
      return
    }

    if (method === 'PUT' && path === '/local/carapace') {
      handlePutCarapace(configDir, client, req, res).catch((err: unknown) => {
        process.stderr.write(`[local-api] PUT /local/carapace error: ${String(err)}\n`)
        sendJson(res, 500, { error: 'Internal server error' })
      })
      return
    }

    if (method === 'POST' && path === '/local/carapace/sync') {
      handleSyncCarapace(configDir, client, res).catch((err: unknown) => {
        process.stderr.write(`[local-api] POST /local/carapace/sync error: ${String(err)}\n`)
        sendJson(res, 500, { error: 'Internal server error' })
      })
      return
    }

    if (method === 'GET' && path === '/local/config') {
      handleGetConfig(config, res)
      return
    }

    if (method === 'GET' && path === '/local/profiles') {
      handleGetProfiles(config, res)
      return
    }

    // 404 for all unmatched paths
    sendJson(res, 404, { error: 'Not found' })
  }
}
