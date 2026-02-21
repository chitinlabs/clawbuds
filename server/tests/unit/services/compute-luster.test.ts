/**
 * computeLuster 纯函数单元测试
 * Phase 3 简化版：以 0.5 为基准权重，与背书分取等权平均
 * Phase 9 升级：信任加权版，endorserTrustScores 为空时退化为等权平均（向后兼容）
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

// ─── Phase 9: 信任加权版 ────────────────────────────────────────────────────

describe('computeLuster (Phase 9 trust-weighted)', () => {
  // 向后兼容：endorserTrustScores 为空时退化为 Phase 3 等权版
  it('should degrade to equal-weight when endorserTrustScores is empty', () => {
    // 等同于 Phase 3: (0.5 + 0.9) / 2 = 0.70
    expect(computeLuster([0.9], [])).toBeCloseTo(0.7, 10)
  })

  it('should degrade to equal-weight when endorserTrustScores is omitted', () => {
    // 无第二参数同 Phase 3
    expect(computeLuster([0.8, 0.7, 0.9])).toBeCloseTo(0.725, 10)
    expect(computeLuster([0.8, 0.7, 0.9], undefined)).toBeCloseTo(0.725, 10)
  })

  it('should match PRD example: scores=[0.8,0.7,0.9], trusts=[0.9,0.3,0.7] → ≈0.71', () => {
    // PRD §3.3 示例:
    // baseline_weight = 1.0
    // weighted_sum = 0.8×0.9 + 0.7×0.3 + 0.9×0.7 = 0.72 + 0.21 + 0.63 = 1.56
    // trust_sum = 0.9 + 0.3 + 0.7 = 1.9
    // luster = (0.5×1.0 + 1.56) / (1.0 + 1.9) = 2.06 / 2.9 ≈ 0.710345
    expect(computeLuster([0.8, 0.7, 0.9], [0.9, 0.3, 0.7])).toBeCloseTo(0.710345, 4)
  })

  it('high-trust endorser should weigh more than low-trust endorser', () => {
    // Alice（trust=0.9, score=0.9）vs Bob（trust=0.1, score=0.9）
    // Alice high trust: (0.5×1 + 0.9×0.9) / (1 + 0.9) = (0.5 + 0.81) / 1.9 ≈ 0.689
    const aliceHigh = computeLuster([0.9], [0.9])
    // Bob low trust: (0.5×1 + 0.9×0.1) / (1 + 0.1) = (0.5 + 0.09) / 1.1 ≈ 0.536
    const bobLow = computeLuster([0.9], [0.1])
    expect(aliceHigh).toBeGreaterThan(bobLow)
  })

  it('should clamp result to [0.1, 1.0]', () => {
    // 极高信任 + 极高分：不超过 1.0
    const high = computeLuster([1.0, 1.0, 1.0], [1.0, 1.0, 1.0])
    expect(high).toBeLessThanOrEqual(1.0)

    // 零分零信任应该不低于 0.1（baseline 0.5 加权）
    const low = computeLuster([0.0, 0.0], [0.0, 0.0])
    expect(low).toBeGreaterThanOrEqual(0.1)
  })

  it('should give baseline-only result when all trust scores are zero', () => {
    // trust=0 的背书相当于无权重，结果由基准决定
    // (0.5×1.0 + 0.9×0 + 0.8×0) / (1.0 + 0 + 0) = 0.5
    const result = computeLuster([0.9, 0.8], [0.0, 0.0])
    expect(result).toBeCloseTo(0.5, 5)
  })

  it('should throw or handle mismatched array lengths gracefully', () => {
    // endorsementScores 和 endorserTrustScores 长度不一致
    // 规则：只处理两者中较短的长度，多余的分数忽略
    // (或者实现可以 zip 到 min 长度)
    // 此测试验证函数不 crash，返回合理值（≥0.1 且 ≤1.0）
    const result = computeLuster([0.8, 0.7, 0.9], [0.9, 0.3])
    expect(result).toBeGreaterThanOrEqual(0.1)
    expect(result).toBeLessThanOrEqual(1.0)
  })
})
