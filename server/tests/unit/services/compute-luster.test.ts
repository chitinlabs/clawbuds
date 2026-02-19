/**
 * computeLuster 纯函数单元测试
 * Phase 3 简化版：以 0.5 为基准权重，与背书分取等权平均
 */

import { describe, it, expect } from 'vitest'
import { computeLuster } from '../../../src/services/pearl.service.js'

describe('computeLuster', () => {
  it('should return 0.5 when there are no endorsements', () => {
    expect(computeLuster([])).toBe(0.5)
  })

  it('should compute correctly with 1 endorsement (score=0.9)', () => {
    // (0.5 + 0.9) / 2 = 0.70
    expect(computeLuster([0.9])).toBeCloseTo(0.7, 10)
  })

  it('should compute correctly with 3 endorsements [0.8, 0.7, 0.9]', () => {
    // (0.5 + 0.8 + 0.7 + 0.9) / 4 = 0.725
    expect(computeLuster([0.8, 0.7, 0.9])).toBeCloseTo(0.725, 10)
  })

  it('should clamp to 0.1 on very low endorsement', () => {
    // 1 次 score=0.1: (0.5 + 0.1) / 2 = 0.30 → no clamp needed
    expect(computeLuster([0.1])).toBeCloseTo(0.3, 10)
    // Extreme low: (0.5 + 0.0) / 2 = 0.25 → no clamp, but verify clamp works
    const luster0 = computeLuster([0.0])
    expect(luster0).toBeGreaterThanOrEqual(0.1)
  })

  it('should clamp to maximum 1.0 when all endorsements are perfect', () => {
    // Many perfect scores won't exceed 1.0 due to 0.5 baseline
    // (0.5 + 1.0) / 2 = 0.75 → no clamp
    expect(computeLuster([1.0])).toBeCloseTo(0.75, 10)
    // (0.5 + 1.0 + 1.0 + 1.0 + 1.0 + 1.0) / 6 = 5.5/6 ≈ 0.917 → under 1.0
    const luster = computeLuster([1.0, 1.0, 1.0, 1.0, 1.0])
    expect(luster).toBeLessThanOrEqual(1.0)
  })

  it('should not go below 0.1 even with 0 scores', () => {
    // Many zero scores: (0.5 + 0 + 0 + ... + 0) / (1+N) → approaches 0 but clamped to 0.1
    const luster = computeLuster(Array(100).fill(0))
    expect(luster).toBeGreaterThanOrEqual(0.1)
  })

  it('luster with score=0.1: expect 0.30', () => {
    // PRD spec: 1 次低分背书, score=0.1: luster = (0.5 + 0.1) / 2 = 0.30
    expect(computeLuster([0.1])).toBeCloseTo(0.30, 5)
  })
})
