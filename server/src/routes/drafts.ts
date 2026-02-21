/**
 * Draft API Routes（Phase 11 T4）
 * POST   /api/v1/drafts             — 创建草稿（Agent 专用）
 * GET    /api/v1/drafts             — 查询草稿列表
 * GET    /api/v1/drafts/:id         — 获取单个草稿
 * POST   /api/v1/drafts/:id/approve — 批准并发送
 * POST   /api/v1/drafts/:id/reject  — 拒绝草稿
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { DraftService } from '../services/draft.service.js'
import type { DraftStatus } from '../db/repositories/interfaces/draft.repository.interface.js'

export function createDraftsRouter(draftService: DraftService, clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/drafts
  router.post('/', requireAuth, async (req, res) => {
    const { toClawId, content, reason, expiresAt } = req.body ?? {}
    if (!toClawId || typeof toClawId !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'toClawId is required'))
      return
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'content is required'))
      return
    }
    if (content.length > 10000) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'content must be under 10000 characters'))
      return
    }
    if (!reason || typeof reason !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'reason is required'))
      return
    }
    try {
      const clawId = req.clawId as string
      const draft = await draftService.create(clawId, toClawId, content, reason, expiresAt)
      res.status(201).json(successResponse(draft))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/drafts
  router.get('/', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const status = req.query['status'] as string | undefined
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 100)
      const offset = parseInt(String(req.query['offset'] ?? '0'), 10)

      const validStatuses = ['pending', 'approved', 'rejected', 'expired']
      if (status && !validStatuses.includes(status)) {
        res.status(400).json(errorResponse('VALIDATION_ERROR', `Invalid status: ${status}`))
        return
      }

      const drafts = await draftService.list(clawId, {
        status: status as DraftStatus | undefined,
        limit,
        offset,
      })
      res.json(successResponse(drafts))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list drafts'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/drafts/:id
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const found = await draftService.findById(req.params['id'] as string, clawId)
      if (!found) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Draft not found'))
        return
      }
      res.json(successResponse(found))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get draft'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/drafts/:id/approve
  router.post('/:id/approve', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const { draft, messageId } = await draftService.approve(req.params['id'] as string, clawId)
      res.json(successResponse({ draft, messageId }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve draft'
      if (message.includes('not found')) {
        res.status(404).json(errorResponse('NOT_FOUND', message))
        return
      }
      if (message.includes('Access denied')) {
        res.status(403).json(errorResponse('FORBIDDEN', message))
        return
      }
      if (message.includes('already')) {
        res.status(409).json(errorResponse('CONFLICT', message))
        return
      }
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/drafts/:id/reject
  router.post('/:id/reject', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const draft = await draftService.reject(req.params['id'] as string, clawId)
      res.json(successResponse(draft))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject draft'
      if (message.includes('not found')) {
        res.status(404).json(errorResponse('NOT_FOUND', message))
        return
      }
      if (message.includes('Access denied')) {
        res.status(403).json(errorResponse('FORBIDDEN', message))
        return
      }
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}
