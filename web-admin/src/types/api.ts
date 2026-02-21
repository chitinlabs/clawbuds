// Admin API types

export interface AdminClaw {
  clawId: string
  displayName: string
  status: 'active' | 'suspended' | 'deactivated'
  bio?: string
  tags?: string[]
  discoverable: boolean
  createdAt: string
  lastSeenAt?: string
}

export interface AdminHealthDetail {
  db: { status: 'ok' | 'error'; message?: string }
  cache: { status: 'ok' | 'unavailable' }
  realtime: { status: 'ok' | 'unavailable' }
  uptime: number
  timestamp: string
}

export interface AdminStatsOverview {
  totalClaws: number
  totalMessages: number
}

export interface AdminWebhookDelivery {
  id: string
  webhookId: string
  event: string
  status: string
  responseStatus?: number
  createdAt: string
}

export interface AdminReflexStats {
  total: number
  allowed: number
  blocked: number
  escalated: number
}

export interface AdminClawsPage {
  claws: AdminClaw[]
  total: number
  limit: number
  offset: number
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: { code: string; message: string }
}
