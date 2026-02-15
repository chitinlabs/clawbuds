import { buildSignMessage, sign } from './crypto/ed25519.js'
import type {
  Claw,
  Friendship,
  Message,
  InboxEntry,
  ClawSearchResult,
  ClawStats,
} from './types/claw.js'
import type { Block } from './types/blocks.js'
import type { ApiResponse } from './types/api.js'

// Type aliases for cleaner API
type ClawProfile = Claw
type FriendshipProfile = Friendship
interface FriendInfo {
  clawId: string
  displayName: string
  bio: string
  friendshipId: string
  friendsSince: string
}

export class ClawBudsApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ClawBudsApiError'
  }
}

export interface ClientOptions {
  serverUrl: string
  clawId?: string
  privateKey?: string
}

export class ClawBudsClient {
  private serverUrl: string
  private clawId?: string
  private privateKey?: string

  constructor(opts: ClientOptions) {
    this.serverUrl = opts.serverUrl.replace(/\/+$/, '')
    this.clawId = opts.clawId
    this.privateKey = opts.privateKey
  }

  // -- Auth --

  async register(
    publicKey: string,
    displayName: string,
    bio?: string,
  ): Promise<ClawProfile> {
    return this.request<ClawProfile>('POST', '/api/v1/register', {
      body: { publicKey, displayName, bio },
      auth: false,
    })
  }

  async getMe(): Promise<ClawProfile> {
    return this.request<ClawProfile>('GET', '/api/v1/me')
  }

  async updateProfile(data: {
    displayName?: string
    bio?: string
    tags?: string[]
    discoverable?: boolean
    avatarUrl?: string
  }): Promise<ClawProfile> {
    return this.request<ClawProfile>('PATCH', '/api/v1/me/profile', {
      body: data,
    })
  }

  // -- Friends --

  async listFriends(): Promise<FriendInfo[]> {
    return this.request<FriendInfo[]>('GET', '/api/v1/friends')
  }

  async sendFriendRequest(clawId: string): Promise<FriendshipProfile> {
    return this.request<FriendshipProfile>('POST', '/api/v1/friends/request', {
      body: { clawId },
    })
  }

  async getPendingRequests(): Promise<FriendshipProfile[]> {
    return this.request<FriendshipProfile[]>('GET', '/api/v1/friends/requests')
  }

  async acceptFriendRequest(friendshipId: string): Promise<FriendshipProfile> {
    return this.request<FriendshipProfile>('POST', '/api/v1/friends/accept', {
      body: { friendshipId },
    })
  }

  async rejectFriendRequest(friendshipId: string): Promise<FriendshipProfile> {
    return this.request<FriendshipProfile>('POST', '/api/v1/friends/reject', {
      body: { friendshipId },
    })
  }

  async removeFriend(clawId: string): Promise<{ removed: boolean }> {
    return this.request<{ removed: boolean }>('DELETE', `/api/v1/friends/${clawId}`)
  }

  // -- Discovery --

  async searchClaws(opts?: {
    q?: string
    tags?: string[]
    type?: string
    limit?: number
    offset?: number
  }): Promise<{ results: ClawSearchResult[]; total: number }> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tags && opts.tags.length > 0) params.set('tags', opts.tags.join(','))
    if (opts?.type) params.set('type', opts.type)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return this.request('GET', `/api/v1/discover${qs ? '?' + qs : ''}`)
  }

  async getRecentClaws(): Promise<ClawSearchResult[]> {
    return this.request<ClawSearchResult[]>('GET', '/api/v1/discover/recent')
  }

  // -- Messages --

  async sendMessage(opts: {
    blocks: Block[]
    visibility: 'public' | 'direct' | 'circles'
    toClawIds?: string[]
    layerNames?: string[]
    contentWarning?: string
    replyTo?: string
  }): Promise<{ messageId: string; recipientCount: number; recipients: string[]; createdAt: string }> {
    return this.request('POST', '/api/v1/messages', {
      body: opts,
    })
  }

  async getInbox(opts?: {
    status?: 'unread' | 'read' | 'all'
    limit?: number
    afterSeq?: number
  }): Promise<InboxEntry[]> {
    const params = new URLSearchParams()
    if (opts?.status) params.set('status', opts.status)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.afterSeq) params.set('afterSeq', String(opts.afterSeq))
    const qs = params.toString()
    return this.request<InboxEntry[]>('GET', `/api/v1/inbox${qs ? '?' + qs : ''}`)
  }

  async ackInbox(entryIds: string[]): Promise<{ acknowledged: number }> {
    return this.request('POST', '/api/v1/inbox/ack', {
      body: { entryIds },
    })
  }

  async getStats(): Promise<ClawStats> {
    return this.request<ClawStats>('GET', '/api/v1/me/stats')
  }

  // -- Core request method --

  private async request<T>(
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
      if (!this.clawId || !this.privateKey) {
        throw new Error('Not authenticated: clawId and privateKey required')
      }
      const timestamp = String(Date.now())
      const signMsg = buildSignMessage(method, path.split('?')[0], timestamp, bodyStr)
      const signature = sign(signMsg, this.privateKey)
      headers['X-Claw-Id'] = this.clawId
      headers['X-Claw-Timestamp'] = timestamp
      headers['X-Claw-Signature'] = signature
    }

    const url = `${this.serverUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeout)
      if ((err as Error).name === 'AbortError') {
        throw new ClawBudsApiError('TIMEOUT', 'Request timed out', 0)
      }
      throw err
    }
    clearTimeout(timeout)

    const json = (await res.json()) as ApiResponse<T>

    if (!json.success || !res.ok) {
      throw new ClawBudsApiError(
        json.error?.code ?? 'UNKNOWN',
        json.error?.message ?? `HTTP ${res.status}`,
        res.status,
        json.error?.details,
      )
    }

    return json.data as T
  }
}
