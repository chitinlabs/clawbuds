/**
 * 任务 26.1：SchedulerService 测试（定时器注册验证）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SchedulerService } from '../../src/services/scheduler.service.js'

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should call heartbeat task periodically', async () => {
    const heartbeatTask = vi.fn().mockResolvedValue(undefined)
    const decayTask = vi.fn().mockResolvedValue(undefined)
    const cleanupTask = vi.fn().mockResolvedValue(undefined)

    const scheduler = new SchedulerService({
      heartbeatIntervalMs: 1000,
      decayIntervalMs: 5000,
      cleanupIntervalMs: 5000,
      onHeartbeat: heartbeatTask,
      onDecay: decayTask,
      onCleanup: cleanupTask,
    })
    scheduler.start()

    // Advance past the heartbeat interval
    await vi.advanceTimersByTimeAsync(1500)
    expect(heartbeatTask).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('should call decay task periodically', async () => {
    const heartbeatTask = vi.fn().mockResolvedValue(undefined)
    const decayTask = vi.fn().mockResolvedValue(undefined)
    const cleanupTask = vi.fn().mockResolvedValue(undefined)

    const scheduler = new SchedulerService({
      heartbeatIntervalMs: 10000,
      decayIntervalMs: 1000,
      cleanupIntervalMs: 10000,
      onHeartbeat: heartbeatTask,
      onDecay: decayTask,
      onCleanup: cleanupTask,
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(1500)
    expect(decayTask).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('should call cleanup task periodically', async () => {
    const heartbeatTask = vi.fn().mockResolvedValue(undefined)
    const decayTask = vi.fn().mockResolvedValue(undefined)
    const cleanupTask = vi.fn().mockResolvedValue(undefined)

    const scheduler = new SchedulerService({
      heartbeatIntervalMs: 10000,
      decayIntervalMs: 10000,
      cleanupIntervalMs: 1000,
      onHeartbeat: heartbeatTask,
      onDecay: decayTask,
      onCleanup: cleanupTask,
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(1500)
    expect(cleanupTask).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('should stop all timers when stop() is called', async () => {
    const task = vi.fn().mockResolvedValue(undefined)
    const scheduler = new SchedulerService({
      heartbeatIntervalMs: 1000,
      decayIntervalMs: 1000,
      cleanupIntervalMs: 1000,
      onHeartbeat: task,
      onDecay: task,
      onCleanup: task,
    })
    scheduler.start()
    scheduler.stop()

    await vi.advanceTimersByTimeAsync(3000)
    expect(task).not.toHaveBeenCalled()
  })

  it('should not throw when task fails', async () => {
    const heartbeatTask = vi.fn().mockRejectedValue(new Error('task error'))
    const decayTask = vi.fn().mockResolvedValue(undefined)
    const cleanupTask = vi.fn().mockResolvedValue(undefined)

    const scheduler = new SchedulerService({
      heartbeatIntervalMs: 1000,
      decayIntervalMs: 10000,
      cleanupIntervalMs: 10000,
      onHeartbeat: heartbeatTask,
      onDecay: decayTask,
      onCleanup: cleanupTask,
    })
    scheduler.start()

    // Should not throw even when task fails
    await expect(vi.advanceTimersByTimeAsync(1500)).resolves.not.toThrow()

    scheduler.stop()
  })
})
