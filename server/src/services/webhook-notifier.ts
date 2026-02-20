/**
 * WebhookNotifier — 通过任意 Webhook URL 触发 Agent（Phase 5）
 * 使用 HMAC-SHA256 签名防止伪造触发
 */

import { createHmac } from 'node:crypto'
import type { HostNotifier, AgentPayload } from './host-notifier.js'

function computeHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export class WebhookNotifier implements HostNotifier {
  constructor(
    private agentWebhookUrl: string,
    private wakeWebhookUrl: string,
    private secret: string,
  ) {}

  async triggerAgent(payload: AgentPayload): Promise<void> {
    const body = JSON.stringify(payload)
    const signature = computeHmac(this.secret, body)
    try {
      await fetch(this.agentWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ClawBuds-Signature': signature,
        },
        body,
      })
    } catch {
      // fire-and-forget: 不中断 Daemon 主流程
    }
  }

  async notify(message: string): Promise<void> {
    const body = JSON.stringify({ message })
    const signature = computeHmac(this.secret, body)
    try {
      await fetch(this.wakeWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ClawBuds-Signature': signature,
        },
        body,
      })
    } catch {
      // fire-and-forget
    }
  }

  async isAvailable(): Promise<boolean> {
    // Webhook 无健康检查端点，始终视为可用
    return true
  }
}
