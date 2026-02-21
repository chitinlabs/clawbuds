/**
 * Trust Repository Interface Tests (Phase 7)
 * 验证类型定义、常量值与 PRD §3.1 规格一致
 */

import { describe, it, expect } from 'vitest'
import {
  TRUST_WEIGHTS,
  Q_SIGNAL_DELTAS,
  TRUST_MONTHLY_DECAY,
  TRUST_W_DAMPENING,
  DUNBAR_LAYER_SCORES,
  type TrustSignal,
  type TrustScoreRecord,
  type ITrustRepository,
} from '../../src/db/repositories/interfaces/trust.repository.interface.js'

describe('TrustRepository 类型定义与常量', () => {
  describe('TRUST_WEIGHTS', () => {
    it('应满足 PRD §3.1 权重规格（q=0.25, h=0.40, n=0.20, w=0.15）', () => {
      expect(TRUST_WEIGHTS.q).toBe(0.25)
      expect(TRUST_WEIGHTS.h).toBe(0.40)
      expect(TRUST_WEIGHTS.n).toBe(0.20)
      expect(TRUST_WEIGHTS.w).toBe(0.15)
    })

    it('所有权重之和应为 1.0', () => {
      const total = TRUST_WEIGHTS.q + TRUST_WEIGHTS.h + TRUST_WEIGHTS.n + TRUST_WEIGHTS.w
      expect(total).toBeCloseTo(1.0, 5)
    })

    it('H 权重应是四维中最高的', () => {
      const { q, h, n, w } = TRUST_WEIGHTS
      expect(h).toBeGreaterThan(q)
      expect(h).toBeGreaterThan(n)
      expect(h).toBeGreaterThan(w)
    })
  })

  describe('Q_SIGNAL_DELTAS', () => {
    it('应满足 PRD §3.2 信号 delta 映射', () => {
      expect(Q_SIGNAL_DELTAS['pearl_endorsed_high']).toBe(+0.05)
      expect(Q_SIGNAL_DELTAS['pearl_endorsed_low']).toBe(-0.02)
      expect(Q_SIGNAL_DELTAS['groom_replied']).toBe(+0.03)
      expect(Q_SIGNAL_DELTAS['groom_ignored']).toBe(-0.02)
      expect(Q_SIGNAL_DELTAS['pearl_reshared']).toBe(+0.08)
    })

    it('正向信号应有正 delta', () => {
      expect(Q_SIGNAL_DELTAS['pearl_endorsed_high']).toBeGreaterThan(0)
      expect(Q_SIGNAL_DELTAS['groom_replied']).toBeGreaterThan(0)
      expect(Q_SIGNAL_DELTAS['pearl_reshared']).toBeGreaterThan(0)
    })

    it('负向信号应有负 delta', () => {
      expect(Q_SIGNAL_DELTAS['pearl_endorsed_low']).toBeLessThan(0)
      expect(Q_SIGNAL_DELTAS['groom_ignored']).toBeLessThan(0)
    })

    it('所有 TrustSignal 类型值应有对应 delta', () => {
      const signals: TrustSignal[] = [
        'pearl_endorsed_high',
        'pearl_endorsed_low',
        'groom_replied',
        'groom_ignored',
        'pearl_reshared',
      ]
      for (const signal of signals) {
        expect(Q_SIGNAL_DELTAS[signal]).toBeDefined()
        expect(typeof Q_SIGNAL_DELTAS[signal]).toBe('number')
      }
    })
  })

  describe('TRUST_MONTHLY_DECAY', () => {
    it('应为 0.99（月衰减率，半衰期约 5.7 年）', () => {
      expect(TRUST_MONTHLY_DECAY).toBe(0.99)
    })

    it('应在 (0, 1) 范围内（有效的乘数衰减）', () => {
      expect(TRUST_MONTHLY_DECAY).toBeGreaterThan(0)
      expect(TRUST_MONTHLY_DECAY).toBeLessThan(1)
    })
  })

  describe('TRUST_W_DAMPENING', () => {
    it('应为 0.5（间接信任衰减系数）', () => {
      expect(TRUST_W_DAMPENING).toBe(0.5)
    })
  })

  describe('DUNBAR_LAYER_SCORES', () => {
    it('应满足 PRD §3.4 Dunbar 层级分值', () => {
      expect(DUNBAR_LAYER_SCORES['core']).toBe(1.0)
      expect(DUNBAR_LAYER_SCORES['sympathy']).toBe(0.75)
      expect(DUNBAR_LAYER_SCORES['active']).toBe(0.5)
      expect(DUNBAR_LAYER_SCORES['casual']).toBe(0.25)
    })

    it('层级分值应严格递减（core > sympathy > active > casual）', () => {
      expect(DUNBAR_LAYER_SCORES['core']).toBeGreaterThan(DUNBAR_LAYER_SCORES['sympathy'])
      expect(DUNBAR_LAYER_SCORES['sympathy']).toBeGreaterThan(DUNBAR_LAYER_SCORES['active'])
      expect(DUNBAR_LAYER_SCORES['active']).toBeGreaterThan(DUNBAR_LAYER_SCORES['casual'])
    })

    it('所有分值应在 [0, 1] 范围内', () => {
      for (const score of Object.values(DUNBAR_LAYER_SCORES)) {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('TrustScoreRecord 类型结构', () => {
    it('应能构造合法的 TrustScoreRecord（h=null 未背书场景）', () => {
      const record: TrustScoreRecord = {
        id: 'trust_abc',
        fromClawId: 'claw_001',
        toClawId: 'claw_002',
        domain: '_overall',
        qScore: 0.5,
        hScore: null,  // 未背书
        nScore: 0.5,
        wScore: 0.0,
        composite: 0.5,
        updatedAt: '2026-02-20T00:00:00.000Z',
      }
      expect(record.hScore).toBeNull()
      expect(record.domain).toBe('_overall')
    })

    it('应能构造 h=0.0（主动低信任）区别于 null', () => {
      const record: TrustScoreRecord = {
        id: 'trust_def',
        fromClawId: 'claw_001',
        toClawId: 'claw_003',
        domain: 'AI',
        qScore: 0.6,
        hScore: 0.0,  // 主动标记低信任
        nScore: 0.4,
        wScore: 0.1,
        composite: 0.27,
        updatedAt: '2026-02-20T00:00:00.000Z',
      }
      // 0.0 !== null，这是关键区分
      expect(record.hScore).toBe(0.0)
      expect(record.hScore).not.toBeNull()
    })
  })
})
