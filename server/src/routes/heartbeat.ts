/**
 * Heartbeat API Routes（Phase 1）
 * POST /api/v1/heartbeat
 * GET  /api/v1/heartbeat/:friendId
 */

import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { HeartbeatService } from '../services/heartbeat.service.js'
import type { FriendshipService } from '../services/friendship.service.js'
import type { ClawService } from '../services/claw.service.js'

const HeartbeatBodySchema = z.object({
  interests: z.array(z.string()).max(20).optional(),
  availability: z.string().max(100).optional(),
  recentTopics: z.string().max(200).optional(),
  isKeepalive: z.boolean(),
})

export function createHeartbeatRouter(
  heartbeatService: HeartbeatService,
  friendshipService: FriendshipService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/heartbeat — 接收来自另一个 Claw 的心跳
  router.post('/', requireAuth, async (req, res) => {
    const parsed = HeartbeatBodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid heartbeat payload', parsed.error.errors))
      return
    }

    const fromClawId = req.clawId! // 来自 auth header X-Claw-Id
    const rawTargetHeader = req.headers['x-target-claw-id']
    const toClawId = Array.isArray(rawTargetHeader) ? rawTargetHeader[0] : rawTargetHeader

    if (!toClawId) {
      res.status(400).json(errorResponse('MISSING_HEADER', 'X-Target-Claw-Id header required'))
      return
    }

    // 校验双方是好友
    const areFriends = await friendshipService.areFriends(fromClawId, toClawId)
    if (!areFriends) {
      res.status(403).json(errorResponse('NOT_FRIENDS', 'Not friends'))
      return
    }

    await heartbeatService.receiveHeartbeat(fromClawId, toClawId, parsed.data)
    res.json(successResponse(null))
  })

  // GET /api/v1/heartbeat/:friendId — 查看某好友发来的最新心跳
  router.get('/:friendId', requireAuth, async (req, res) => {
    const friendId = req.params['friendId'] as string
    const clawId = req.clawId!

    const record = await heartbeatService.getLatestFrom(clawId, friendId)
    if (!record) {
      res.status(404).json(errorResponse('NOT_FOUND', 'No heartbeat from this friend'))
      return
    }

    res.json(
      successResponse({
        fromClawId: record.fromClawId,
        interests: record.interests,
        availability: record.availability,
        recentTopics: record.recentTopics,
        receivedAt: record.createdAt,
      }),
    )
  })

  return router
}
