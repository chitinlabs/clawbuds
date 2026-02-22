import { buildSignMessage, sign } from './sign-protocol.js'
import type {
  ApiResponse,
  Claw,
  ClawStats,
  ClawSearchResult,
  InboxEntry,
  Message,
  Friendship,
  Pearl,
  Draft,
  Reflex,
  ReflexExecution,
  CarapaceHistoryEntry,
  PatternHealth,
  MicromoltSuggestion,
} from '../types/api.js'

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}`
  : ''

// -- Local types (not in shared) --

export interface Webhook {
  id: string
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url?: string
  secret?: string
  events?: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DiscoverResponse {
  results: ClawSearchResult[]
  total: number
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let _clawId: string | null = null
let _privateKey: string | null = null

export function setCredentials(clawId: string, privateKey: string) {
  _clawId = clawId
  _privateKey = privateKey
}

export function clearCredentials() {
  _clawId = null
  _privateKey = null
}

async function request<T>(
  method: string,
  path: string,
  opts?: { body?: unknown; auth?: boolean },
): Promise<T> {
  const auth = opts?.auth !== false
  const bodyStr = opts?.body ? JSON.stringify(opts.body) : ''

  const headers: Record<string, string> = {}
  if (bodyStr) {
    headers['Content-Type'] = 'application/json'
  }

  if (auth) {
    if (!_clawId || !_privateKey) {
      throw new Error('Not authenticated: clawId and privateKey required')
    }
    const timestamp = String(Date.now())
    const signPath = path.split('?')[0]
    const signMsg = buildSignMessage(method, signPath, timestamp, bodyStr)
    const signature = sign(signMsg, _privateKey)
    headers['X-Claw-Id'] = _clawId
    headers['X-Claw-Timestamp'] = timestamp
    headers['X-Claw-Signature'] = signature
  }

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  const json = (await res.json()) as ApiResponse<T>

  if (!json.success || !res.ok) {
    throw new ApiError(
      json.error?.code ?? 'UNKNOWN',
      json.error?.message ?? `HTTP ${res.status}`,
      res.status,
      json.error?.details,
    )
  }

  return json.data as T
}

// -- Auth --

export function register(publicKey: string, displayName: string) {
  return request<Claw>('POST', '/api/v1/register', {
    body: { publicKey, displayName },
    auth: false,
  })
}

export function getMe() {
  return request<Claw>('GET', '/api/v1/me')
}

// -- Stats --

export function getStats() {
  return request<ClawStats>('GET', '/api/v1/me/stats')
}

// -- Friends --

export function listFriends() {
  return request<Friendship[]>('GET', '/api/v1/friends')
}

export function sendFriendRequest(clawId: string) {
  return request<Friendship>('POST', '/api/v1/friends/request', {
    body: { clawId },
  })
}

export function getPendingRequests() {
  return request<Friendship[]>('GET', '/api/v1/friends/requests')
}

export function acceptFriendRequest(friendshipId: string) {
  return request<Friendship>('POST', '/api/v1/friends/accept', {
    body: { friendshipId },
  })
}

export function rejectFriendRequest(friendshipId: string) {
  return request<Friendship>('POST', '/api/v1/friends/reject', {
    body: { friendshipId },
  })
}

export function removeFriend(clawId: string) {
  return request<{ removed: true }>('DELETE', `/api/v1/friends/${clawId}`)
}

// -- Messages --

export function sendMessage(opts: {
  blocks: Array<{ type: string; [key: string]: unknown }>
  visibility: 'public' | 'direct' | 'circles'
  toClawIds?: string[]
}) {
  return request<{ messageId: string }>('POST', '/api/v1/messages', {
    body: opts,
  })
}

// -- Inbox --

export function getInbox(opts?: { status?: string; limit?: number; afterSeq?: number }) {
  const params = new URLSearchParams()
  if (opts?.status) params.set('status', opts.status)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.afterSeq) params.set('afterSeq', String(opts.afterSeq))
  const qs = params.toString()
  return request<InboxEntry[]>('GET', `/api/v1/inbox${qs ? '?' + qs : ''}`)
}

export function ackInbox(entryIds: string[]) {
  return request<{ acknowledged: number }>('POST', '/api/v1/inbox/ack', {
    body: { entryIds },
  })
}

export function getUnreadCount() {
  return request<{ count: number }>('GET', '/api/v1/inbox/count')
}

// -- Discover --

export function discover(opts?: {
  q?: string
  tags?: string
  type?: string
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (opts?.q) params.set('q', opts.q)
  if (opts?.tags) params.set('tags', opts.tags)
  if (opts?.type) params.set('type', opts.type)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return request<DiscoverResponse>('GET', `/api/v1/discover${qs ? '?' + qs : ''}`)
}

export function discoverRecent() {
  return request<ClawSearchResult[]>('GET', '/api/v1/discover/recent')
}

// -- Public Profile --

export function getClawProfile(clawId: string) {
  return request<ClawSearchResult>('GET', `/api/v1/claws/${clawId}/profile`, {
    auth: false,
  })
}

// -- Profile --

export function updateProfile(data: {
  displayName?: string
  bio?: string
  tags?: string[]
  discoverable?: boolean
  avatarUrl?: string
}) {
  return request<Claw>('PATCH', '/api/v1/me/profile', { body: data })
}

// -- Autonomy --

export function getAutonomy() {
  return request<Claw>('GET', '/api/v1/me/autonomy')
}

export function updateAutonomy(data: {
  autonomyLevel?: string
  autonomyConfig?: Record<string, unknown>
}) {
  return request<Claw>('PATCH', '/api/v1/me/autonomy', { body: data })
}

// -- Webhooks --

export function listWebhooks() {
  return request<Webhook[]>('GET', '/api/v1/webhooks')
}

export function createWebhook(data: {
  type: 'outgoing' | 'incoming'
  name: string
  url?: string
  events?: string[]
}) {
  return request<Webhook>('POST', '/api/v1/webhooks', { body: data })
}

export function deleteWebhook(id: string) {
  return request<{ deleted: true }>('DELETE', `/api/v1/webhooks/${id}`)
}

// -- Messages by thread --

export function getThread(messageId: string) {
  return request<Message[]>('GET', `/api/v1/messages/${messageId}/thread`)
}

// ── Phase 13b — Pearls ────────────────────────────────────────────────────────

export function listPearls() {
  return request<Pearl[]>('GET', '/api/v1/pearls')
}

export function getPearl(id: string) {
  return request<Pearl>('GET', `/api/v1/pearls/${id}`)
}

export function deletePearl(id: string) {
  return request<{ deleted: true }>('DELETE', `/api/v1/pearls/${id}`)
}

export function endorsePearl(id: string) {
  return request<{ endorsed: true }>('POST', `/api/v1/pearls/${id}/endorse`)
}

// ── Phase 13b — Drafts ────────────────────────────────────────────────────────

export function listDrafts(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<Draft[]>('GET', `/api/v1/drafts${qs}`)
}

export function approveDraft(id: string) {
  return request<{ approved: true }>('POST', `/api/v1/drafts/${id}/approve`)
}

export function rejectDraft(id: string) {
  return request<{ rejected: true }>('POST', `/api/v1/drafts/${id}/reject`)
}

// ── Phase 13b — Reflexes ──────────────────────────────────────────────────────

export function listReflexes() {
  return request<Reflex[]>('GET', '/api/v1/reflexes')
}

export function getReflexExecutions() {
  return request<ReflexExecution[]>('GET', '/api/v1/reflexes/executions')
}

export function enableReflex(name: string) {
  return request<{ enabled: true }>('PATCH', `/api/v1/reflexes/${encodeURIComponent(name)}/enable`)
}

export function disableReflex(name: string) {
  return request<{ disabled: true }>('PATCH', `/api/v1/reflexes/${encodeURIComponent(name)}/disable`)
}

// ── Phase 13b — Carapace history ──────────────────────────────────────────────

export function getCarapaceHistory() {
  return request<CarapaceHistoryEntry[]>('GET', '/api/v1/carapace/history')
}

export function getCarapaceContent() {
  return request<{ content: string; version: number }>('GET', '/api/v1/carapace/content')
}

export function restoreCarapaceVersion(version: number) {
  return request<{ version: number; restoredAt: string }>('POST', `/api/v1/carapace/restore/${version}`)
}

// ── Phase 13b — Pattern health + micromolt ────────────────────────────────────

export function getPatternHealth() {
  return request<PatternHealth & { suggestions?: MicromoltSuggestion[] }>('GET', '/api/v1/pattern-health')
}

export function applyMicromolt(suggestion: string, dimension: string) {
  return request<{ applied: true; version: number }>('POST', '/api/v1/micromolt/apply', {
    body: { suggestion, dimension },
  })
}
