/**
 * RelationshipService.computeDecayRate 单元测试
 * 分段线性函数，验证各区间和边界连续性
 */

import { describe, it, expect } from 'vitest'
import { computeDecayRate } from '../../src/services/relationship.service.js'

describe('computeDecayRate', () => {
  // ─────────────────────────────────────────────
  // 区间验证：s ∈ [0, 0.3)  →  decay = 0.95 + s * 0.1
  // ─────────────────────────────────────────────
  describe('range [0, 0.3)', () => {
    it('s = 0 → 0.95', () => {
      expect(computeDecayRate(0)).toBeCloseTo(0.95)
    })
    it('s = 0.1 → 0.95 + 0.1 * 0.1 = 0.960', () => {
      expect(computeDecayRate(0.1)).toBeCloseTo(0.96)
    })
    it('s = 0.29 → 0.95 + 0.29 * 0.1 = 0.979', () => {
      expect(computeDecayRate(0.29)).toBeCloseTo(0.979)
    })
  })

  // ─────────────────────────────────────────────
  // 区间验证：s ∈ [0.3, 0.6)  →  decay = 0.98 + (s - 0.3) * 0.05
  // ─────────────────────────────────────────────
  describe('range [0.3, 0.6)', () => {
    it('s = 0.3 → 0.980 (连续于上一区间边界)', () => {
      // 上一区间: 0.95 + 0.3 * 0.1 = 0.98
      // 本区间: 0.98 + 0 * 0.05 = 0.98
      expect(computeDecayRate(0.3)).toBeCloseTo(0.98)
    })
    it('s = 0.45 → 0.98 + 0.15 * 0.05 = 0.9875', () => {
      expect(computeDecayRate(0.45)).toBeCloseTo(0.9875)
    })
    it('s = 0.59 → 0.98 + 0.29 * 0.05 = 0.9945', () => {
      expect(computeDecayRate(0.59)).toBeCloseTo(0.9945)
    })
  })

  // ─────────────────────────────────────────────
  // 区间验证：s ∈ [0.6, 0.8)  →  decay = 0.995 + (s - 0.6) * 0.02
  // ─────────────────────────────────────────────
  describe('range [0.6, 0.8)', () => {
    it('s = 0.6 → 0.995 (连续于上一区间边界)', () => {
      // 上一区间: 0.98 + 0.3 * 0.05 = 0.995
      // 本区间: 0.995 + 0 * 0.02 = 0.995
      expect(computeDecayRate(0.6)).toBeCloseTo(0.995)
    })
    it('s = 0.7 → 0.995 + 0.1 * 0.02 = 0.997', () => {
      expect(computeDecayRate(0.7)).toBeCloseTo(0.997)
    })
    it('s = 0.79 → 0.995 + 0.19 * 0.02 = 0.9988', () => {
      expect(computeDecayRate(0.79)).toBeCloseTo(0.9988)
    })
  })

  // ─────────────────────────────────────────────
  // 区间验证：s ∈ [0.8, 1.0]  →  decay = 0.999
  // ─────────────────────────────────────────────
  describe('range [0.8, 1.0]', () => {
    it('s = 0.8 → 0.999', () => {
      expect(computeDecayRate(0.8)).toBeCloseTo(0.999)
    })
    it('s = 0.9 → 0.999', () => {
      expect(computeDecayRate(0.9)).toBeCloseTo(0.999)
    })
    it('s = 1.0 → 0.999', () => {
      expect(computeDecayRate(1.0)).toBeCloseTo(0.999)
    })
  })

  // ─────────────────────────────────────────────
  // 边界连续性验证（无跳变）
  // ─────────────────────────────────────────────
  describe('boundary continuity (no cliff effects)', () => {
    it('boundary at 0.3: left side ≈ right side', () => {
      const leftSide = computeDecayRate(0.2999)
      const rightSide = computeDecayRate(0.3)
      expect(Math.abs(leftSide - rightSide)).toBeLessThan(0.001)
    })

    it('boundary at 0.6: left side ≈ right side', () => {
      const leftSide = computeDecayRate(0.5999)
      const rightSide = computeDecayRate(0.6)
      expect(Math.abs(leftSide - rightSide)).toBeLessThan(0.001)
    })

    it('boundary at 0.8: left side ≈ right side', () => {
      const leftSide = computeDecayRate(0.7999)
      const rightSide = computeDecayRate(0.8)
      expect(Math.abs(leftSide - rightSide)).toBeLessThan(0.001)
    })
  })

  // ─────────────────────────────────────────────
  // 单调递增（strength 越高，decay 越慢）
  // ─────────────────────────────────────────────
  describe('monotonically non-decreasing', () => {
    it('higher strength → higher or equal decay rate', () => {
      const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
      for (let i = 0; i < samples.length - 1; i++) {
        const curr = computeDecayRate(samples[i])
        const next = computeDecayRate(samples[i + 1])
        expect(next).toBeGreaterThanOrEqual(curr - 0.0001) // small tolerance for floating point
      }
    })
  })
})
