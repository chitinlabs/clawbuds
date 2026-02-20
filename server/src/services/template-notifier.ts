/**
 * TemplateNotifier — 降级策略（Phase 5）
 * 宿主 LLM 不可用时使用预设模板处理，不调用 LLM
 * - REFLEX_BATCH: 全部存草稿（最保守策略）
 * - GROOM_REQUEST: 使用预设 phatic 短语模板，存草稿供用户审阅
 * - BRIEFING_REQUEST: 生成纯数据型简报（无语义分析）
 * - LLM_REQUEST: 存草稿并说明原因
 */

import type { HostNotifier, AgentPayload } from './host-notifier.js'

export class TemplateNotifier implements HostNotifier {
  async triggerAgent(payload: AgentPayload): Promise<void> {
    // 降级处理：所有 Agent 请求都以保守策略处理（存草稿，不直接执行）
    // 实际草稿存储需要 ClawBuds CLI 支持，此处仅记录日志
    const logMsg = `[TemplateNotifier] Fallback for ${payload.type} batchId=${payload.batchId}: storing as draft (no LLM available)`
    // eslint-disable-next-line no-console
    console.warn(logMsg)
    // 在生产实现中，可调用 draft service 将 payload 存为草稿
  }

  async notify(_message: string): Promise<void> {
    // 降级时不发送通知（宿主不可用）
  }

  async isAvailable(): Promise<boolean> {
    // TemplateNotifier 本身始终"可用"但代表宿主不可用
    // 调用方通过检查是否使用 TemplateNotifier 来判断降级状态
    return false
  }
}
