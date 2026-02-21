export interface WebhookProfile {
  id: string
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url: string | null
  secret: string
  events: string[]
  active: boolean
  failureCount: number
  lastTriggeredAt: string | null
  lastStatusCode: number | null
  createdAt: string
}

/** Webhook profile without the secret — safe for API responses */
export type WebhookProfilePublic = Omit<WebhookProfile, 'secret'>

export function toPublicWebhookProfile(profile: WebhookProfile): WebhookProfilePublic {
  const { secret: _secret, ...publicProfile } = profile
  return publicProfile
}

export interface WebhookDeliveryProfile {
  id: string
  webhookId: string
  eventType: string
  payload: unknown
  statusCode: number | null
  responseBody: string | null
  durationMs: number | null
  success: boolean
  createdAt: string
}

export interface CreateWebhookInput {
  id: string
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url: string | null
  secret: string
  events: string[]
}

export interface UpdateWebhookInput {
  url?: string
  events?: string[]
  active?: boolean
  name?: string
}

export interface RecordDeliveryInput {
  id: string
  webhookId: string
  eventType: string
  payload: string
  statusCode: number | null
  responseBody: string | null
  durationMs: number
  success: boolean
}

export interface UpdateWebhookStatusInput {
  lastTriggeredAt: string
  lastStatusCode: number | null
  failureCount?: number
  active?: boolean
}

/**
 * Repository interface for Webhook operations
 */
export interface IWebhookRepository {
  /**
   * Create a new webhook
   * @throws WebhookError with code 'DUPLICATE_NAME' if name already exists
   */
  create(input: CreateWebhookInput): Promise<WebhookProfile>

  /**
   * Find webhook by ID
   */
  findById(id: string): Promise<WebhookProfile | null>

  /**
   * List all webhooks for a claw
   */
  listByClawId(clawId: string): Promise<WebhookProfile[]>

  /**
   * Update webhook
   */
  update(id: string, input: UpdateWebhookInput): Promise<WebhookProfile>

  /**
   * Delete webhook
   */
  delete(id: string): Promise<void>

  /**
   * Get webhook deliveries
   */
  getDeliveries(webhookId: string, limit: number): Promise<WebhookDeliveryProfile[]>

  /**
   * 获取全局 Webhook 投递日志（管理员用）
   */
  findAllDeliveries(limit: number): Promise<WebhookDeliveryProfile[]>

  /**
   * Record a webhook delivery
   */
  recordDelivery(input: RecordDeliveryInput): Promise<WebhookDeliveryProfile>

  /**
   * Update webhook status after delivery attempt
   */
  updateWebhookStatus(id: string, input: UpdateWebhookStatusInput): Promise<void>

  /**
   * Get active webhooks for a recipient that subscribe to an event
   */
  getActiveWebhooksForRecipient(recipientId: string): Promise<WebhookProfile[]>
}

export class WebhookError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WebhookError'
  }
}
