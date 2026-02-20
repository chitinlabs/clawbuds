/**
 * ReflexBatchProcessor — Layer 1 Reflex 批处理器（Phase 5）
 * 积累 queued_for_l1 事件，达到阈值或超时后触发批处理
 */

import { customAlphabet } from 'nanoid'
import type { IReflexExecutionRepository } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { HostNotifier } from './host-notifier.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

export interface BatchQueueItem {
  reflexId: string
  reflexName: string
  clawId: string
  eventType: string
  triggerData: Record<string, unknown>
  context?: Record<string, unknown>
  queuedAt?: number
}

export interface BatchProcessorConfig {
  batchSize?: number     // default: 10
  maxWaitMs?: number     // default: 600000 (10 min)
}

export class ReflexBatchProcessor {
  private queue: BatchQueueItem[] = []
  private oldestQueuedAt: number | null = null
  private readonly batchSize: number
  private readonly maxWaitMs: number

  constructor(
    private executionRepo: IReflexExecutionRepository,
    private hostNotifier: HostNotifier,
    config: BatchProcessorConfig = {},
  ) {
    this.batchSize = config.batchSize ?? 10
    this.maxWaitMs = config.maxWaitMs ?? 600_000
  }

  enqueue(item: BatchQueueItem): void {
    const now = Date.now()
    if (this.oldestQueuedAt === null) {
      this.oldestQueuedAt = now
    }
    this.queue.push({ ...item, queuedAt: now })
  }

  queueSize(): number {
    return this.queue.length
  }

  async shouldTrigger(): Promise<boolean> {
    if (this.queue.length === 0) return false
    if (this.queue.length >= this.batchSize) return true
    if (this.oldestQueuedAt !== null && Date.now() - this.oldestQueuedAt >= this.maxWaitMs) {
      return true
    }
    return false
  }

  async triggerBatch(clawId: string): Promise<string> {
    const batchId = `batch_${nanoid()}`
    const items = [...this.queue]

    // 清空队列
    this.queue = []
    this.oldestQueuedAt = null

    // 构建自然语言 payload message
    const message = this.formatBatchMessage(batchId, items)

    // 触发 Agent（fire-and-forget）
    await this.hostNotifier.triggerAgent({
      batchId,
      type: 'REFLEX_BATCH',
      message,
      metadata: { clawId, itemCount: items.length },
    })

    return batchId
  }

  async acknowledgeBatch(batchId: string): Promise<void> {
    // 查找此 batch 相关的 dispatched_to_l1 记录并更新为 l1_acknowledged
    const dispatched = await this.executionRepo.findByResult(
      // clawId 从 batchId 无法直接获取，使用空字符串查所有（实际应通过 API 传 clawId）
      '',
      'dispatched_to_l1' as any,
    )
    // 过滤匹配 batchId 的记录（存在 details.batchId）
    const matched = dispatched.filter(
      (e) => (e.details as Record<string, unknown>)?.['batchId'] === batchId
    )
    // 在 Phase 5 简化实现：仅记录 acknowledgement 到日志
    // 完整实现需在 IReflexExecutionRepository 添加 updateResult 方法
    void matched  // suppress unused variable warning
  }

  private formatBatchMessage(batchId: string, items: BatchQueueItem[]): string {
    const lines = [
      `[REFLEX_BATCH] batchId=${batchId}，包含 ${items.length} 个待处理 Reflex：`,
      '',
    ]
    items.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.reflexName}: 事件类型=${item.eventType}`)
      if (item.context) {
        lines.push(`   上下文: ${JSON.stringify(item.context)}`)
      }
    })
    lines.push('')
    lines.push(`处理完毕后请执行: clawbuds reflex ack --batch-id ${batchId}`)
    return lines.join('\n')
  }
}
