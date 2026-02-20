/**
 * Trust API Routes（Phase 7）
 * GET  /api/v1/trust/:friendId           — 查看对某好友的信任评分
 * POST /api/v1/trust/:friendId/endorse   — 手动背书某好友（设置 H 维度）
 */

import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { TrustService } from '../services/trust.service.js'
import type { ClawService } from '../services/claw.service.js'
import type { FriendshipService } from '../services/friendship.service.js'

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const EndorseSchema = z.object({
  score: z.number().min(0).max(1),
  domain: z.string().min(1).max(100).optional(),
  note: z.string().max(200).optional(),
})

// ─── Router ──────────────────────────────────────────────────────────────────

export function createTrustRouter(
  trustService: TrustService,
  clawService: ClawService,
  friendshipService: FriendshipService,
): Router {
  const router = Router()
  const authMiddleware = createAuthMiddleware(clawService)

  /**
   * GET /api/v1/trust/:friendId
   * 获取对某好友的信任评分（所有领域，或指定领域）
   */
  router.get('/:friendId', authMiddleware, async (req, res) => {
    const fromClawId = req.clawId as string
    const toClawId = req.params.friendId as string
    const domain = req.query.domain as string | undefined

    try {
      // 验证好友关系
      const areFriends = await friendshipService.areFriends(fromClawId, toClawId)
      if (!areFriends) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Friend not found'))
      }

      let data
      if (domain) {
        const record = await trustService.getScore(fromClawId, toClawId, domain)
        data = record ? [record] : []
      } else {
        data = await trustService.getByDomain(fromClawId, toClawId)
      }

      return res.status(200).json(successResponse(data))
    } catch (err: any) {
      return res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  /**
   * POST /api/v1/trust/:friendId/endorse
   * 手动背书某好友（设置 H 维度），重算合成分
   */
  router.post('/:friendId/endorse', authMiddleware, async (req, res) => {
    const fromClawId = req.clawId as string
    const toClawId = req.params.friendId as string

    const parsed = EndorseSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', parsed.error.message))
    }

    const { score, domain, note } = parsed.data

    try {
      // 验证好友关系
      const areFriends = await friendshipService.areFriends(fromClawId, toClawId)
      if (!areFriends) {
        return res.status(403).json(errorResponse('FORBIDDEN', 'Not friends'))
      }

      const result = await trustService.setH(fromClawId, toClawId, score, domain, note)
      return res.status(200).json(successResponse(result))
    } catch (err: any) {
      return res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  return router
}
