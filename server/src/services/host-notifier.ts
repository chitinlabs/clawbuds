/**
 * HostNotifier — 宿主 LLM 通知接口（Phase 5）
 * 负责触发 Agent 轮次和注入通知，不负责接收或解析 Agent 响应
 */

export type AgentRequestType =
  | 'REFLEX_BATCH'
  | 'BRIEFING_REQUEST'
  | 'GROOM_REQUEST'
  | 'LLM_REQUEST'

export interface AgentPayload {
  batchId: string
  type: AgentRequestType
  message: string                          // 发给 Agent 的自然语言消息
  metadata?: Record<string, unknown>
}

export interface HostConfig {
  type: 'openclaw' | 'webhook' | 'noop'

  // OpenClaw 配置
  hooksUrl?: string        // default: "http://localhost:41241"
  apiKey?: string

  // Webhook 配置
  agentWebhookUrl?: string
  wakeWebhookUrl?: string
  webhookSecret?: string

  // 通用配置
  batchSize?: number       // default: 10
  maxWaitMs?: number       // default: 600000 (10 min)
  fallbackToTemplate?: boolean
}

export interface HostNotifier {
  /**
   * 向主会话注入通知（fire-and-forget）
   */
  notify(message: string): Promise<void>

  /**
   * 触发隔离 Agent 轮次（fire-and-forget）
   * Agent 通过 CLI 自主执行，Daemon 不解析响应
   */
  triggerAgent(payload: AgentPayload): Promise<void>

  /**
   * 检查宿主是否可用（降级判断）
   */
  isAvailable(): Promise<boolean>
}

// ─── NoopNotifier（测试 / 未配置宿主）────────────────────────────────────────

export class NoopNotifier implements HostNotifier {
  async notify(_message: string): Promise<void> {
    // no-op
  }

  async triggerAgent(_payload: AgentPayload): Promise<void> {
    // no-op
  }

  async isAvailable(): Promise<boolean> {
    return true
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHostNotifier(config: HostConfig): HostNotifier {
  switch (config.type) {
    case 'noop':
      return new NoopNotifier()
    case 'openclaw': {
      // Dynamic import pattern — consumer is responsible for importing OpenClawNotifier
      // Use createHostNotifier only for noop in tests; for openclaw/webhook use direct constructors
      throw new Error('Use new OpenClawNotifier(hooksUrl, apiKey) directly')
    }
    case 'webhook':
      throw new Error('Use new WebhookNotifier(agentUrl, wakeUrl, secret) directly')
    default:
      throw new Error(`Unknown host type: ${(config as HostConfig).type}`)
  }
}
