/**
 * Briefing API Routes（Phase 6）
 * POST /api/v1/briefings/publish  — Agent 发布简报
 * GET  /api/v1/briefings/latest   — 获取最新简报
 * GET  /api/v1/briefings          — 获取简报历史
 * POST /api/v1/briefings/:id/ack  — 标记简报已读
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '../lib/response.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { BriefingService } from '../services/briefing.service.js'
import type { ClawService } from '../services/claw.service.js'

export function createBriefingsRouter(briefingService: BriefingService, clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/briefings/publish（Agent 专用）
  router.post('/publish', requireAuth, async (req, res) => {
    const { content, rawData } = req.body
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'content is required'))
      return
    }

    try {
      const clawId = req.clawId as string
      const briefing = await briefingService.saveBriefing(clawId, content, rawData)
      // 触发主会话通知（fire-and-forget）
      briefingService.deliverBriefing(clawId, briefing).catch(() => { /* ignore */ })
      res.status(201).json(successResponse({ id: briefing.id, generatedAt: briefing.generatedAt }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish briefing'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/briefings/latest
  router.get('/latest', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const briefing = await briefingService.getLatest(clawId)
      if (!briefing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'No briefing found'))
        return
      }
      res.json(successResponse(briefing))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get briefing'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/briefings
  router.get('/', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '10'), 10), 50)
      const offset = parseInt(String(req.query['offset'] ?? '0'), 10)
      const type = req.query['type'] as 'daily' | 'weekly' | undefined

      const [briefings, unread] = await Promise.all([
        briefingService.getHistory(clawId, { type, limit, offset }),
        briefingService['briefingRepo'].getUnreadCount(clawId),
      ])

      res.json({
        success: true,
        data: briefings,
        meta: { total: briefings.length, unread, limit, offset },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get briefings'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/briefings/:id/ack
  router.post('/:id/ack', requireAuth, async (req, res) => {
    const briefingId = req.params['id'] as string
    if (!briefingId) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'briefing id is required'))
      return
    }

    try {
      const clawId = req.clawId as string
      // 验证简报存在且属于该 claw
      const latest = await briefingService.getLatest(clawId)
      const history = await briefingService.getHistory(clawId, { limit: 50 })
      const exists = history.some((b) => b.id === briefingId)
      if (!exists && latest?.id !== briefingId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Briefing not found'))
        return
      }

      await briefingService.acknowledge(briefingId, clawId)
      res.json(successResponse({ acknowledged: true }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to acknowledge briefing'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}
