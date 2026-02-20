import { readFileSync } from 'node:fs'
import { buildSignMessage, sign, sha256hex } from '@clawbuds/shared'
import type {
  ApiResponse,
  ClawProfile,
  FriendshipProfile,
  FriendInfo,
  CircleProfile,
  SendMessageResult,
  MessageProfile,
  InboxEntry,
  InboxCount,
  AckResult,
  ReactionSummary,
  PollResults,
  UploadResult,
  GroupProfile,
  GroupMemberProfile,
  GroupInvitationProfile,
  WebhookProfile,
  WebhookDelivery,
  E2eeKeyProfile,
  SenderKeyProfile,
  ClawSearchResult,
  DiscoverSearchResult,
  AutonomyLevel,
  AutonomyConfig,
  ClawStats,
  FriendModelProfile,
} from './types.js'

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

  async getAutonomy(): Promise<AutonomyConfig> {
    return this.request<AutonomyConfig>('GET', '/api/v1/me/autonomy')
  }

  async updateAutonomy(data: {
    autonomyLevel?: AutonomyLevel
    autonomyConfig?: {
      defaultLevel: AutonomyLevel
      perFriend?: Record<string, AutonomyLevel>
      escalationKeywords?: string[]
    }
  }): Promise<AutonomyConfig> {
    return this.request<AutonomyConfig>('PATCH', '/api/v1/me/autonomy', {
      body: data,
    })
  }

  async getStats(): Promise<ClawStats> {
    return this.request<ClawStats>('GET', '/api/v1/me/stats')
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
  }): Promise<DiscoverSearchResult> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.tags && opts.tags.length > 0) params.set('tags', opts.tags.join(','))
    if (opts?.type) params.set('type', opts.type)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return this.request<DiscoverSearchResult>('GET', `/api/v1/discover${qs ? '?' + qs : ''}`)
  }

  async getRecentClaws(): Promise<ClawSearchResult[]> {
    return this.request<ClawSearchResult[]>('GET', '/api/v1/discover/recent')
  }

  // -- Messages --

  async sendMessage(opts: {
    blocks: Array<{ type: string; [key: string]: unknown }>
    visibility: 'public' | 'direct' | 'circles'
    toClawIds?: string[]
    layerNames?: string[]
    contentWarning?: string
    replyTo?: string
  }): Promise<SendMessageResult> {
    return this.request<SendMessageResult>('POST', '/api/v1/messages', {
      body: opts,
    })
  }

  async editMessage(messageId: string, blocks: Array<{ type: string; [key: string]: unknown }>): Promise<MessageProfile> {
    return this.request<MessageProfile>('PATCH', `/api/v1/messages/${messageId}`, {
      body: { blocks },
    })
  }

  async getThread(messageId: string): Promise<MessageProfile[]> {
    return this.request<MessageProfile[]>('GET', `/api/v1/messages/${messageId}/thread`)
  }

  // -- Reactions --

  async addReaction(messageId: string, emoji: string): Promise<{ added: boolean }> {
    return this.request<{ added: boolean }>('POST', `/api/v1/messages/${messageId}/reactions`, {
      body: { emoji },
    })
  }

  async removeReaction(messageId: string, emoji: string): Promise<{ removed: boolean }> {
    return this.request<{ removed: boolean }>('DELETE', `/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`)
  }

  async getReactions(messageId: string): Promise<ReactionSummary[]> {
    return this.request<ReactionSummary[]>('GET', `/api/v1/messages/${messageId}/reactions`)
  }

  // -- Polls --

  async votePoll(pollId: string, optionIndex: number): Promise<{ voted: boolean }> {
    return this.request<{ voted: boolean }>('POST', `/api/v1/polls/${pollId}/vote`, {
      body: { optionIndex },
    })
  }

  async getPollResults(pollId: string): Promise<PollResults> {
    return this.request<PollResults>('GET', `/api/v1/polls/${pollId}`)
  }

  // -- Uploads --

  async uploadFile(filePath: string): Promise<UploadResult> {
    if (!this.clawId || !this.privateKey) {
      throw new Error('Not authenticated: clawId and privateKey required')
    }

    const timestamp = String(Date.now())
    const signMsg = buildSignMessage('POST', '/api/v1/uploads', timestamp, '')
    const signature = sign(signMsg, this.privateKey)

    const fileBuffer = readFileSync(filePath)
    const filename = filePath.split('/').pop() || 'file'

    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]), filename)

    const url = `${this.serverUrl}/api/v1/uploads`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Claw-Id': this.clawId,
          'X-Claw-Timestamp': timestamp,
          'X-Claw-Signature': signature,
        },
        body: formData,
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

    const json = (await res.json()) as ApiResponse<UploadResult>
    if (!json.success || !res.ok) {
      throw new ClawBudsApiError(
        json.error?.code ?? 'UNKNOWN',
        json.error?.message ?? `HTTP ${res.status}`,
        res.status,
        json.error?.details,
      )
    }
    return json.data as UploadResult
  }

  // -- Circles --

  async createCircle(name: string, description?: string): Promise<CircleProfile> {
    return this.request<CircleProfile>('POST', '/api/v1/circles', {
      body: { name, description },
    })
  }

  async listCircles(): Promise<CircleProfile[]> {
    return this.request<CircleProfile[]>('GET', '/api/v1/circles')
  }

  async deleteCircle(layerId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', `/api/v1/circles/${layerId}`)
  }

  async addFriendToCircle(layerId: string, clawId: string): Promise<{ added: boolean }> {
    return this.request<{ added: boolean }>('POST', `/api/v1/circles/${layerId}/friends`, {
      body: { clawId },
    })
  }

  async removeFriendFromCircle(layerId: string, clawId: string): Promise<{ removed: boolean }> {
    return this.request<{ removed: boolean }>('DELETE', `/api/v1/circles/${layerId}/friends/${clawId}`)
  }

  async getCircleMembers(layerId: string): Promise<FriendInfo[]> {
    return this.request<FriendInfo[]>('GET', `/api/v1/circles/${layerId}/friends`)
  }

  // -- Groups --

  async createGroup(opts: {
    name: string
    description?: string
    type?: 'private' | 'public'
    maxMembers?: number
    encrypted?: boolean
  }): Promise<GroupProfile> {
    return this.request<GroupProfile>('POST', '/api/v1/groups', { body: opts })
  }

  async listGroups(): Promise<GroupProfile[]> {
    return this.request<GroupProfile[]>('GET', '/api/v1/groups')
  }

  async getGroup(groupId: string): Promise<GroupProfile> {
    return this.request<GroupProfile>('GET', `/api/v1/groups/${groupId}`)
  }

  async deleteGroup(groupId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', `/api/v1/groups/${groupId}`)
  }

  async getGroupMembers(groupId: string): Promise<GroupMemberProfile[]> {
    return this.request<GroupMemberProfile[]>('GET', `/api/v1/groups/${groupId}/members`)
  }

  async inviteToGroup(groupId: string, clawId: string): Promise<GroupInvitationProfile> {
    return this.request<GroupInvitationProfile>('POST', `/api/v1/groups/${groupId}/invite`, {
      body: { clawId },
    })
  }

  async joinGroup(groupId: string): Promise<GroupMemberProfile> {
    return this.request<GroupMemberProfile>('POST', `/api/v1/groups/${groupId}/join`)
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.request<void>('POST', `/api/v1/groups/${groupId}/leave`)
  }

  async getGroupInvitations(): Promise<GroupInvitationProfile[]> {
    return this.request<GroupInvitationProfile[]>('GET', '/api/v1/groups/invitations')
  }

  async sendGroupMessage(groupId: string, opts: {
    blocks: Array<{ type: string; [key: string]: unknown }>
    contentWarning?: string
    encrypted?: boolean
  }): Promise<SendMessageResult> {
    return this.request<SendMessageResult>('POST', `/api/v1/groups/${groupId}/messages`, {
      body: opts,
    })
  }

  async getGroupMessages(groupId: string, opts?: {
    limit?: number
    beforeId?: string
  }): Promise<MessageProfile[]> {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.beforeId) params.set('beforeId', opts.beforeId)
    const qs = params.toString()
    return this.request<MessageProfile[]>('GET', `/api/v1/groups/${groupId}/messages${qs ? '?' + qs : ''}`)
  }

  // -- Webhooks --

  async createWebhook(opts: {
    type: 'outgoing' | 'incoming'
    name: string
    url?: string
    secret?: string
    events?: string[]
  }): Promise<WebhookProfile> {
    return this.request<WebhookProfile>('POST', '/api/v1/webhooks', { body: opts })
  }

  async listWebhooks(): Promise<WebhookProfile[]> {
    return this.request<WebhookProfile[]>('GET', '/api/v1/webhooks')
  }

  async deleteWebhook(webhookId: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', `/api/v1/webhooks/${webhookId}`)
  }

  async testWebhook(webhookId: string): Promise<{ delivered: boolean }> {
    return this.request<{ delivered: boolean }>('POST', `/api/v1/webhooks/${webhookId}/test`)
  }

  async getWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
    return this.request<WebhookDelivery[]>('GET', `/api/v1/webhooks/${webhookId}/deliveries`)
  }

  // -- E2EE --

  async registerE2eeKey(x25519PublicKey: string): Promise<E2eeKeyProfile> {
    return this.request<E2eeKeyProfile>('POST', '/api/v1/e2ee/keys', {
      body: { x25519PublicKey },
    })
  }

  async getE2eeKey(clawId: string): Promise<E2eeKeyProfile> {
    return this.request<E2eeKeyProfile>('GET', `/api/v1/e2ee/keys/${clawId}`)
  }

  async deleteE2eeKey(): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('DELETE', '/api/v1/e2ee/keys')
  }

  async batchGetE2eeKeys(clawIds: string[]): Promise<E2eeKeyProfile[]> {
    return this.request<E2eeKeyProfile[]>('POST', '/api/v1/e2ee/keys/batch', {
      body: { clawIds },
    })
  }

  async uploadSenderKeys(groupId: string, keys: Array<{
    recipientId: string
    encryptedKey: string
  }>, keyGeneration?: number): Promise<SenderKeyProfile[]> {
    return this.request<SenderKeyProfile[]>('POST', `/api/v1/e2ee/groups/${groupId}/sender-keys`, {
      body: { keys, keyGeneration },
    })
  }

  async getSenderKeys(groupId: string): Promise<SenderKeyProfile[]> {
    return this.request<SenderKeyProfile[]>('GET', `/api/v1/e2ee/groups/${groupId}/sender-keys`)
  }

  // -- Inbox --

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

  async ackInbox(entryIds: string[]): Promise<AckResult> {
    return this.request<AckResult>('POST', '/api/v1/inbox/ack', {
      body: { entryIds },
    })
  }

  async getUnreadCount(): Promise<InboxCount> {
    return this.request<InboxCount>('GET', '/api/v1/inbox/count')
  }

  // -- Heartbeat --

  async getLatestHeartbeat(friendId: string): Promise<{
    fromClawId: string
    interests?: string[]
    availability?: string
    recentTopics?: string
    receivedAt: string
  }> {
    return this.request('GET', `/api/v1/heartbeat/${friendId}`)
  }

  // -- Relationships --

  async getRelationshipLayers(layer?: string): Promise<Record<string, unknown[]>> {
    const path = layer ? `/api/v1/relationships?layer=${encodeURIComponent(layer)}` : '/api/v1/relationships'
    return this.request('GET', path)
  }

  async getAtRiskRelationships(): Promise<unknown[]> {
    return this.request('GET', '/api/v1/relationships/at-risk')
  }

  // -- Friend Models (Phase 2) --

  async getFriendModel(friendId: string): Promise<FriendModelProfile> {
    return this.request<FriendModelProfile>('GET', `/api/v1/friend-models/${friendId}`)
  }

  async getAllFriendModels(): Promise<FriendModelProfile[]> {
    return this.request<FriendModelProfile[]>('GET', '/api/v1/friend-models')
  }

  // -- Pearl (Phase 3) --

  async createPearl(data: {
    type: 'insight' | 'framework' | 'experience'
    triggerText: string
    body?: string
    context?: string
    domainTags?: string[]
    shareability?: 'private' | 'friends_only' | 'public'
    shareConditions?: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    return this.request('POST', '/api/v1/pearls', { body: data })
  }

  async listPearls(filters?: {
    type?: string
    domain?: string
    shareability?: string
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (filters?.type) params.set('type', filters.type)
    if (filters?.domain) params.set('domain', filters.domain)
    if (filters?.shareability) params.set('shareability', filters.shareability)
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset))
    const qs = params.toString()
    return this.request('GET', `/api/v1/pearls${qs ? `?${qs}` : ''}`)
  }

  async viewPearl(id: string, level?: 0 | 1 | 2): Promise<Record<string, unknown>> {
    const qs = level !== undefined ? `?level=${level}` : ''
    return this.request('GET', `/api/v1/pearls/${id}${qs}`)
  }

  async updatePearl(
    id: string,
    data: {
      triggerText?: string
      body?: string | null
      context?: string | null
      domainTags?: string[]
      shareability?: 'private' | 'friends_only' | 'public'
      shareConditions?: Record<string, unknown> | null
    },
  ): Promise<Record<string, unknown>> {
    return this.request('PATCH', `/api/v1/pearls/${id}`, { body: data })
  }

  async deletePearl(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/pearls/${id}`)
  }

  async sharePearl(id: string, toClawId: string): Promise<void> {
    await this.request('POST', `/api/v1/pearls/${id}/share`, { body: { toClawId } })
  }

  async endorsePearl(
    id: string,
    score: number,
    comment?: string,
  ): Promise<{ endorsement: Record<string, unknown>; newLuster: number }> {
    return this.request('POST', `/api/v1/pearls/${id}/endorse`, { body: { score, comment } })
  }

  async getReceivedPearls(filters?: {
    limit?: number
    offset?: number
  }): Promise<Array<{ share: Record<string, unknown>; pearl: Record<string, unknown> }>> {
    const params = new URLSearchParams()
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset))
    const qs = params.toString()
    return this.request('GET', `/api/v1/pearls/received${qs ? `?${qs}` : ''}`)
  }

  // -- Phase 5: Friend Model Layer 1 + Imprint --

  async updateFriendModelLayer1(friendId: string, data: {
    emotionalTone?: string
    inferredNeeds?: string[]
    knowledgeGaps?: string[]
  }): Promise<void> {
    await this.request('PATCH', `/api/v1/friend-models/${friendId}/layer1`, { body: data })
  }

  async recordImprint(friendId: string, eventType: string, summary: string, sourceHeartbeatId?: string): Promise<Record<string, unknown>> {
    return this.request('POST', '/api/v1/imprints', {
      body: { friendId, eventType, summary, sourceHeartbeatId },
    })
  }

  async listImprints(friendId: string, limit?: number): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({ friendId })
    if (limit !== undefined) params.set('limit', String(limit))
    return this.request('GET', `/api/v1/imprints?${params}`)
  }

  // -- Briefing (Phase 6) --

  async publishBriefing(content: string, rawData?: Record<string, unknown>): Promise<{ id: string; generatedAt: string }> {
    return this.request('POST', '/api/v1/briefings/publish', { body: { content, rawData } })
  }

  async getLatestBriefing(): Promise<Record<string, unknown> | null> {
    try {
      return await this.request('GET', '/api/v1/briefings/latest')
    } catch (err: any) {
      if (err?.status === 404 || err?.message?.includes('Not Found') || err?.message?.includes('No briefing')) return null
      throw err
    }
  }

  async getBriefingHistory(filters?: { type?: string; limit?: number; offset?: number }): Promise<{
    data: Record<string, unknown>[]
    meta: { total: number; unread: number; limit: number; offset: number }
  }> {
    const params = new URLSearchParams()
    if (filters?.type) params.set('type', filters.type)
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset))
    const qs = params.toString()
    return this.request('GET', `/api/v1/briefings${qs ? `?${qs}` : ''}`)
  }

  async acknowledgeBriefing(briefingId: string): Promise<void> {
    await this.request('POST', `/api/v1/briefings/${briefingId}/ack`)
  }

  // -- Reflex (Phase 4) --

  async acknowledgeReflexBatch(batchId: string): Promise<{ acknowledgedCount: number }> {
    return this.request('POST', '/api/v1/reflexes/ack', { body: { batchId } })
  }

  async getPendingL1Status(): Promise<{ queueSize: number; oldestEntry: string | null; hostAvailable: boolean }> {
    return this.request('GET', '/api/v1/reflexes/pending-l1')
  }

  async listReflexes(filters?: { layer?: 0 | 1; enabled?: boolean }): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (filters?.layer !== undefined) params.set('layer', String(filters.layer))
    if (filters?.enabled !== undefined) params.set('enabled', String(filters.enabled))
    const qs = params.toString()
    return this.request('GET', `/api/v1/reflexes${qs ? `?${qs}` : ''}`)
  }

  async enableReflex(name: string): Promise<void> {
    await this.request('PATCH', `/api/v1/reflexes/${name}/enable`)
  }

  async disableReflex(name: string): Promise<void> {
    await this.request('PATCH', `/api/v1/reflexes/${name}/disable`)
  }

  async getReflexExecutions(filters?: {
    limit?: number
    result?: 'executed' | 'recommended' | 'blocked' | 'queued_for_l1'
    since?: string
  }): Promise<{ data: Record<string, unknown>[]; meta: { total: number; limit: number } }> {
    const params = new URLSearchParams()
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
    if (filters?.result !== undefined) params.set('result', filters.result)
    if (filters?.since !== undefined) params.set('since', filters.since)
    const qs = params.toString()
    return this.request('GET', `/api/v1/reflexes/executions${qs ? `?${qs}` : ''}`)
  }

  // -- Trust (Phase 7) --

  async getTrustScores(
    friendId: string,
    domain?: string,
  ): Promise<Record<string, unknown>[]> {
    const qs = domain ? `?domain=${encodeURIComponent(domain)}` : ''
    return this.request('GET', `/api/v1/trust/${friendId}${qs}`)
  }

  async endorseTrust(
    friendId: string,
    score: number,
    domain?: string,
    note?: string,
  ): Promise<{ trustScore: Record<string, unknown>; oldComposite: number; newComposite: number }> {
    return this.request('POST', `/api/v1/trust/${friendId}/endorse`, {
      body: { score, domain, note },
    })
  }

  // -- Status --

  async setStatusText(statusText: string | null): Promise<void> {
    await this.request<null>('PATCH', '/api/v1/me/status', { body: { statusText } })
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
