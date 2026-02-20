/**
 * OpenClawNotifier — 通过 OpenClaw /hooks/agent + /hooks/wake 触发 Agent（Phase 5）
 */

import type { HostNotifier, AgentPayload } from './host-notifier.js'

export class OpenClawNotifier implements HostNotifier {
  constructor(
    private hooksUrl: string,   // e.g. "http://localhost:41241"
    private apiKey: string,
  ) {}

  async triggerAgent(payload: AgentPayload): Promise<void> {
    try {
      await fetch(`${this.hooksUrl}/hooks/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          message: payload.message,
          metadata: {
            batchId: payload.batchId,
            type: payload.type,
            ...payload.metadata,
          },
        }),
      })
      // fire-and-forget: 不等待 Agent 完成，不解析响应
    } catch {
      // 网络错误静默处理，不中断 Daemon 主流程
    }
  }

  async notify(message: string): Promise<void> {
    try {
      await fetch(`${this.hooksUrl}/hooks/wake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ message }),
      })
    } catch {
      // fire-and-forget
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.hooksUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      return resp.ok
    } catch {
      return false
    }
  }
}
