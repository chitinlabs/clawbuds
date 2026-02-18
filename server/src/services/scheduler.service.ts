/**
 * SchedulerService
 * 服务端定时任务调度（Phase 1）
 * - 心跳发送（定期）
 * - 关系强度衰减（每日）
 * - 心跳过期清理（每日）
 */

export interface SchedulerOptions {
  heartbeatIntervalMs: number
  decayIntervalMs: number
  cleanupIntervalMs: number
  onHeartbeat: () => Promise<void>
  onDecay: () => Promise<void>
  onCleanup: () => Promise<void>
}

export class SchedulerService {
  private timers: ReturnType<typeof setInterval>[] = []
  private readonly opts: SchedulerOptions

  constructor(opts: SchedulerOptions) {
    this.opts = opts
  }

  start(): void {
    const { heartbeatIntervalMs, decayIntervalMs, cleanupIntervalMs } = this.opts

    const heartbeatTimer = setInterval(() => {
      this.opts.onHeartbeat().catch(() => {
        // Silently ignore errors to keep the scheduler running
      })
    }, heartbeatIntervalMs)

    const decayTimer = setInterval(() => {
      this.opts.onDecay().catch(() => {
        // Silently ignore errors to keep the scheduler running
      })
    }, decayIntervalMs)

    const cleanupTimer = setInterval(() => {
      this.opts.onCleanup().catch(() => {
        // Silently ignore errors to keep the scheduler running
      })
    }, cleanupIntervalMs)

    this.timers.push(heartbeatTimer, decayTimer, cleanupTimer)
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer)
    }
    this.timers = []
  }
}
