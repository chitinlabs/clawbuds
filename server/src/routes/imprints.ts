/**
 * Imprint API Routes（Phase 5）
 * POST /api/v1/imprints     — 记录情感里程碑
 * GET  /api/v1/imprints     — 查询好友 Imprint 列表
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '../lib/response.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ImprintService } from '../services/imprint.service.js'
import type { ClawService } from '../services/claw.service.js'
import type { ImprintEventType } from '../db/repositories/interfaces/imprint.repository.interface.js'

const VALID_EVENT_TYPES: ImprintEventType[] = [
  'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other',
]

export function createImprintsRouter(imprintService: ImprintService, clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/imprints
  router.post('/', requireAuth, async (req, res) => {
    const { friendId, eventType, summary, sourceHeartbeatId } = req.body

    if (!friendId || typeof friendId !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'friendId is required'))
      return
    }
    if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}`))
      return
    }
    if (!summary || typeof summary !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'summary is required'))
      return
    }
    if (summary.length > 200) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'summary must be ≤ 200 characters'))
      return
    }

    try {
      const imprint = await imprintService.record(
        req.clawId as string,
        friendId,
        eventType as ImprintEventType,
        summary,
        sourceHeartbeatId,
      )
      res.status(201).json(successResponse(imprint))
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
    }
  })

  // GET /api/v1/imprints?friendId=<id>&limit=<n>
  router.get('/', requireAuth, async (req, res) => {
    const qFriendId = (Array.isArray(req.query.friendId) ? req.query.friendId[0] : req.query.friendId) as string | undefined
    const qLimit = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined

    if (!qFriendId) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'friendId query parameter is required'))
      return
    }

    const limit = qLimit ? Math.min(parseInt(qLimit, 10) || 20, 100) : 20

    try {
      const imprints = await imprintService.findByFriend(req.clawId as string, qFriendId, limit)
      res.json(successResponse(imprints))
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
    }
  })

  return router
}
