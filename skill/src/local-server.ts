/**
 * skill/src/local-server.ts
 * Phase 13a: Daemon local HTTP server
 *
 * Combines:
 * 1. createLocalApiHandler  → handles /local/* routes
 * 2. sirv                   → serves SPA static files for everything else
 *
 * Always binds to 127.0.0.1 only — never exposed to the network.
 */
import { createServer, type Server } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import sirv from 'sirv'
import {
  createLocalApiHandler,
  type LocalApiClient,
  type LocalApiConfig,
  type LocalApiHandler,
} from './local-api.js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface LocalServerOptions {
  /** Port to listen on. Pass 0 to let the OS pick an available port. */
  port: number
  /** Path to the .clawbuds config directory */
  configDir: string
  client: LocalApiClient
  config: LocalApiConfig
  getServerConnected: () => boolean
  getActiveProfiles: () => string[]
  /** Optional directory to serve as a static SPA. If omitted, non-/local/ paths return 404. */
  staticDir?: string
}

export interface LocalServer {
  start(): Promise<{ port: number }>
  stop(): Promise<void>
}

// ── Implementation ────────────────────────────────────────────────────────────

function buildStaticHandler(staticDir: string): LocalApiHandler {
  // sirv in dev mode so etag / cache-control headers are set properly
  return sirv(staticDir, { single: true, dev: false })
}

function notFoundHandler(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
}

/**
 * Creates a local HTTP server for the daemon.
 * Routes:
 *   /local/*  → local-api handler
 *   /*        → sirv static file server (SPA fallback) or 404
 */
export function createLocalServer(opts: LocalServerOptions): LocalServer {
  const localApiHandler = createLocalApiHandler({
    configDir: opts.configDir,
    client: opts.client,
    config: opts.config,
    getServerConnected: opts.getServerConnected,
    getActiveProfiles: opts.getActiveProfiles,
  })

  const staticHandler: LocalApiHandler = opts.staticDir
    ? buildStaticHandler(opts.staticDir)
    : notFoundHandler

  const requestHandler = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url ?? '/'
    const path = url.split('?')[0]

    if (path.startsWith('/local/') || path === '/local') {
      localApiHandler(req, res)
    } else {
      staticHandler(req, res)
    }
  }

  let httpServer: Server | null = null

  return {
    start(): Promise<{ port: number }> {
      return new Promise((resolve, reject) => {
        httpServer = createServer(requestHandler)
        httpServer.on('error', reject)
        httpServer.listen(opts.port, '127.0.0.1', () => {
          const addr = httpServer!.address()
          const port = typeof addr === 'object' && addr ? addr.port : opts.port
          resolve({ port })
        })
      })
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!httpServer) {
          resolve()
          return
        }
        httpServer.close((err) => {
          httpServer = null
          if (err) reject(err)
          else resolve()
        })
      })
    },
  }
}
