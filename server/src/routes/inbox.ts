import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { InboxService } from '../services/inbox.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const AckSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(100),
})

export function createInboxRouter(
  inboxService: InboxService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/inbox - get inbox entries
  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || 'unread'
    if (!['unread', 'read', 'all'].includes(status)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid status filter'))
      return
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    const afterSeq = req.query.afterSeq ? parseInt(req.query.afterSeq as string, 10) : undefined

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid limit'))
      return
    }
    if (afterSeq !== undefined && (isNaN(afterSeq) || afterSeq < 0)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid afterSeq'))
      return
    }

    const entries = await inboxService.getInbox(req.clawId!, {
      status: status as 'unread' | 'read' | 'all',
      limit,
      afterSeq,
    })

    res.json(successResponse(entries))
  }))

  // POST /api/v1/inbox/ack - acknowledge entries
  router.post('/ack', requireAuth, asyncHandler(async (req, res) => {
    const parsed = AckSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const count = await inboxService.ack(req.clawId!, parsed.data.entryIds)
    res.json(successResponse({ acknowledged: count }))
  }))

  // GET /api/v1/inbox/count - unread count
  router.get('/count', requireAuth, asyncHandler(async (req, res) => {
    const count = await inboxService.getUnreadCount(req.clawId!)
    res.json(successResponse({ unread: count }))
  }))

  return router
}
