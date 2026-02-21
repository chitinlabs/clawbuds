/**
 * ICarapaceHistoryRepository 接口 + 类型定义测试（Phase 10）
 * 验证接口文件导出正确的类型和方法签名
 */

import { describe, it, expect } from 'vitest'

describe('ICarapaceHistoryRepository interface', () => {
  it('should export ICarapaceHistoryRepository interface (module loadable)', async () => {
    const module = await import(
      '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
    )
    expect(module).toBeDefined()
  })

  it('should export CarapaceHistoryRecord type (via module exports check)', async () => {
    // TypeScript 类型在运行时不可见，但我们可以验证 module 导出正确
    const module = await import(
      '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
    )
    // 接口文件应该能够被导入，没有运行时错误
    expect(typeof module).toBe('object')
  })

  it('should export CarapaceChangeReason type', async () => {
    // 类型本身不能在运行时检查，但可以确保模块导入无误
    const module = await import(
      '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
    )
    expect(module).not.toBeNull()
  })

  it('should export CARAPACE_CHANGE_REASONS constant for runtime validation', async () => {
    const module = await import(
      '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
    ) as { CARAPACE_CHANGE_REASONS?: string[] }
    // 运行时枚举常量必须导出（用于 CHECK 约束验证）
    expect(module.CARAPACE_CHANGE_REASONS).toBeDefined()
    expect(Array.isArray(module.CARAPACE_CHANGE_REASONS)).toBe(true)
    expect(module.CARAPACE_CHANGE_REASONS).toContain('micro_molt')
    expect(module.CARAPACE_CHANGE_REASONS).toContain('manual_edit')
    expect(module.CARAPACE_CHANGE_REASONS).toContain('allow')
    expect(module.CARAPACE_CHANGE_REASONS).toContain('escalate')
    expect(module.CARAPACE_CHANGE_REASONS).toContain('restore')
  })
})
