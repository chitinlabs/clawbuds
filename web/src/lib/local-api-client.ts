/**
 * web/src/lib/local-api-client.ts
 * Phase 13a: Client for the daemon's local HTTP API (/local/*)
 *
 * Requests are made to 127.0.0.1 (daemon local gateway).
 * All calls have a 500ms timeout and return null on any failure
 * so callers can gracefully degrade when the daemon is unavailable.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:7878'
const TIMEOUT_MS = 500

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DaemonStatus {
  running: boolean
  serverConnected: boolean
  activeProfiles: string[]
}

export interface CarapacePushResult {
  version: number
  createdAt: string
}

export interface LocalApiClient {
  /** Returns daemon status, or null if unreachable */
  getStatus(): Promise<DaemonStatus | null>
  /** Returns carapace.md content, or null if unavailable */
  getCarapace(): Promise<string | null>
  /** Writes carapace and pushes snapshot. Returns result or null on failure */
  putCarapace(content: string, reason: string): Promise<CarapacePushResult | null>
  /** Syncs carapace from server. Returns new version number or null on failure */
  syncCarapace(): Promise<number | null>
}

export interface LocalApiClientOptions {
  /** Override the base URL (default: http://127.0.0.1:7878) */
  baseUrl?: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a client for the daemon's local HTTP API.
 * All methods return null on network failure, timeout, or non-OK status.
 */
export function createLocalApiClient(opts: LocalApiClientOptions = {}): LocalApiClient {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

  async function get<T>(path: string): Promise<T | null> {
    const res = await fetchWithTimeout(`${base}${path}`)
    if (!res || !res.ok) return null
    try {
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async function post<T>(path: string, body?: unknown): Promise<T | null> {
    const res = await fetchWithTimeout(`${base}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res || !res.ok) return null
    try {
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async function put<T>(path: string, body: unknown): Promise<T | null> {
    const res = await fetchWithTimeout(`${base}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res || !res.ok) return null
    try {
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  return {
    async getStatus(): Promise<DaemonStatus | null> {
      return get<DaemonStatus>('/local/status')
    },

    async getCarapace(): Promise<string | null> {
      const data = await get<{ content: string }>('/local/carapace')
      return data?.content ?? null
    },

    async putCarapace(content: string, reason: string): Promise<CarapacePushResult | null> {
      return put<CarapacePushResult>('/local/carapace', { content, reason })
    },

    async syncCarapace(): Promise<number | null> {
      const data = await post<{ version: number }>('/local/carapace/sync')
      return data?.version ?? null
    },
  }
}
