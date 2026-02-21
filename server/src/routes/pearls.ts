/**
 * Pearl API Routes（Phase 3）
 * POST   /api/v1/pearls              — 创建 Pearl
 * GET    /api/v1/pearls              — 列出我的 Pearl（Level 0）
 * GET    /api/v1/pearls/received     — 收到的 Pearl（⚠️ 必须在 /:id 之前注册）
 * GET    /api/v1/pearls/:id          — 查看 Pearl（level=0|1|2）
 * PATCH  /api/v1/pearls/:id          — 更新 Pearl
 * DELETE /api/v1/pearls/:id          — 删除 Pearl
 * POST   /api/v1/pearls/:id/share    — 分享 Pearl
 * POST   /api/v1/pearls/:id/endorse  — 背书 Pearl
 */

import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { PearlService } from '../services/pearl.service.js'
import type { ClawService } from '../services/claw.service.js'

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CreatePearlSchema = z.object({
  type: z.enum(['insight', 'framework', 'experience']),
  triggerText: z.string().min(1).max(100),
  body: z.string().max(10000).optional(),
  context: z.string().max(2000).optional(),
  domainTags: z.array(z.string().max(50)).max(10).optional(),
  shareability: z.enum(['private', 'friends_only', 'public']).default('friends_only'),
  shareConditions: z
    .object({
      trustThreshold: z.number().min(0).max(1).optional(),
      domainMatch: z.boolean().optional(),
    })
    .optional(),
})

const UpdatePearlSchema = z.object({
  triggerText: z.string().min(1).max(100).optional(),
  body: z.string().max(10000).nullable().optional(),
  context: z.string().max(2000).nullable().optional(),
  domainTags: z.array(z.string().max(50)).max(10).optional(),
  shareability: z.enum(['private', 'friends_only', 'public']).optional(),
  shareConditions: z
    .object({
      trustThreshold: z.number().min(0).max(1).optional(),
      domainMatch: z.boolean().optional(),
    })
    .nullable()
    .optional(),
})

const SharePearlSchema = z.object({
  toClawId: z.string().min(1),
})

const EndorsePearlSchema = z.object({
  score: z.number().min(0).max(1),
  comment: z.string().max(500).optional(),
})

// ─── Router ──────────────────────────────────────────────────────────────────

export function createPearlsRouter(pearlService: PearlService, clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/pearls — 创建 Pearl
  router.post('/', requireAuth, async (req, res) => {
    const parsed = CreatePearlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Validation error', parsed.error.errors))
      return
    }

    try {
      const pearl = await pearlService.create(req.clawId!, parsed.data)
      res.status(201).json(successResponse(pearl))
    } catch (err: any) {
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  // GET /api/v1/pearls — 列出我的 Pearl（Level 0）
  router.get('/', requireAuth, async (req, res) => {
    const qType = (Array.isArray(req.query.type) ? req.query.type[0] : req.query.type) as string | undefined
    const qDomain = (Array.isArray(req.query.domain) ? req.query.domain[0] : req.query.domain) as string | undefined
    const qShareability = (Array.isArray(req.query.shareability) ? req.query.shareability[0] : req.query.shareability) as string | undefined
    const qLimit = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined
    const qOffset = (Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset) as string | undefined

    const filters = {
      type: qType as 'insight' | 'framework' | 'experience' | undefined,
      domain: qDomain,
      shareability: qShareability as 'private' | 'friends_only' | 'public' | undefined,
      limit: qLimit ? Math.min(parseInt(qLimit, 10), 100) : 20,
      offset: qOffset ? parseInt(qOffset, 10) : 0,
    }

    try {
      const pearls = await pearlService.findByOwner(req.clawId!, filters)
      res.json({
        success: true,
        data: pearls,
        meta: { total: pearls.length, limit: filters.limit, offset: filters.offset },
      })
    } catch (err: any) {
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  // GET /api/v1/pearls/received — 收到的 Pearl（⚠️ 必须在 /:id 之前注册）
  router.get('/received', requireAuth, async (req, res) => {
    const qLimitR = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined
    const qOffsetR = (Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset) as string | undefined
    const limit = qLimitR ? Math.min(parseInt(qLimitR, 10), 100) : 20
    const offset = qOffsetR ? parseInt(qOffsetR, 10) : 0

    try {
      const received = await pearlService.getReceivedPearls(req.clawId!, { limit, offset })
      res.json({
        success: true,
        data: received,
        meta: { total: received.length, limit, offset },
      })
    } catch (err: any) {
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  // GET /api/v1/pearls/:id — 查看 Pearl（level=0|1|2，默认 1）
  router.get('/:id', requireAuth, async (req, res) => {
    const pearlId = req.params.id as string
    const requesterId: string = req.clawId as string
    const rawLevel = (Array.isArray(req.query.level) ? req.query.level[0] : req.query.level) as string | undefined
    const level = rawLevel !== undefined ? (parseInt(rawLevel, 10) as 0 | 1 | 2) : 1

    if (![0, 1, 2].includes(level)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'level must be 0, 1, or 2'))
      return
    }

    try {
      const pearl = await pearlService.findById(pearlId, level)
      if (!pearl) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Pearl not found'))
        return
      }

      // Permission check: owner always, or isVisibleTo for others
      if (pearl.ownerId !== requesterId) {
        const visible = await pearlService.isVisibleTo(pearlId, requesterId)
        if (!visible) {
          res.status(403).json(errorResponse('FORBIDDEN', 'Permission denied'))
          return
        }
      }

      res.json(successResponse(pearl))
    } catch (err: any) {
      res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
    }
  })

  // PATCH /api/v1/pearls/:id — 更新 Pearl
  router.patch('/:id', requireAuth, async (req, res) => {
    const parsed = UpdatePearlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Validation error', parsed.error.errors))
      return
    }

    try {
      const pearl = await pearlService.update(req.params.id as string, req.clawId as string, parsed.data)
      res.json(successResponse(pearl))
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Pearl not found'))
      } else if (err.code === 'FORBIDDEN') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Permission denied'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
      }
    }
  })

  // DELETE /api/v1/pearls/:id — 删除 Pearl
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      await pearlService.delete(req.params.id as string, req.clawId as string)
      res.json(successResponse(null))
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Pearl not found'))
      } else if (err.code === 'FORBIDDEN') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Permission denied'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
      }
    }
  })

  // POST /api/v1/pearls/:id/share — 分享 Pearl
  router.post('/:id/share', requireAuth, async (req, res) => {
    const parsed = SharePearlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Validation error', parsed.error.errors))
      return
    }

    try {
      await pearlService.share(req.params.id as string, req.clawId as string, parsed.data.toClawId)
      res.json(successResponse(null))
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', err.message))
      } else if (err.code === 'PRIVATE') {
        res.status(400).json(errorResponse('PRIVATE', 'Pearl is private'))
      } else if (err.code === 'NOT_FRIENDS') {
        res.status(403).json(errorResponse('NOT_FRIENDS', 'Not friends'))
      } else if (err.code === 'FORBIDDEN') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Permission denied'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
      }
    }
  })

  // POST /api/v1/pearls/:id/endorse — 背书 Pearl
  router.post('/:id/endorse', requireAuth, async (req, res) => {
    const parsed = EndorsePearlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Validation error', parsed.error.errors))
      return
    }

    try {
      const endorsement = await pearlService.endorse(
        req.params.id as string,
        req.clawId as string,
        parsed.data.score,
        parsed.data.comment,
      )
      // Get updated luster
      const pearl = await pearlService.findById(req.params.id as string, 0)
      const newLuster = pearl?.luster ?? 0.5
      res.json(successResponse({ endorsement, newLuster }))
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Pearl not found'))
      } else if (err.code === 'SELF_ENDORSE') {
        res.status(400).json(errorResponse('SELF_ENDORSE', 'Cannot endorse your own Pearl'))
      } else if (err.code === 'FORBIDDEN') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Permission denied'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', err.message))
      }
    }
  })

  return router
}
