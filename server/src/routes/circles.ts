import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { CircleService, CircleError } from '../services/circle.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const ClawIdSchema = z.string().regex(/^claw_[0-9a-f]{16}$/)
const CircleIdSchema = z.string().uuid()

const CreateCircleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

const AddFriendSchema = z.object({
  clawId: ClawIdSchema,
})

function handleCircleError(err: unknown, res: import('express').Response): void {
  if (err instanceof CircleError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      DUPLICATE: 409,
      NOT_FRIENDS: 403,
      LIMIT_EXCEEDED: 400,
    }
    res
      .status(statusMap[err.code] || 400)
      .json(errorResponse(err.code, err.message))
    return
  }
  throw err
}

export function createCirclesRouter(
  circleService: CircleService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/circles - create circle
  router.post('/', requireAuth, async (req, res) => {
    const parsed = CreateCircleSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const circle = await circleService.createCircle(
        req.clawId!,
        parsed.data.name,
        parsed.data.description,
      )
      res.status(201).json(successResponse(circle))
    } catch (err) {
      handleCircleError(err, res)
    }
  })

  // GET /api/v1/circles - list circles
  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const circles = await circleService.listCircles(req.clawId!)
    res.json(successResponse(circles))
  }))

  // DELETE /api/v1/circles/:circleId - delete circle
  router.delete('/:circleId', requireAuth, async (req, res) => {
    const circleIdParsed = CircleIdSchema.safeParse(req.params.circleId)
    if (!circleIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid circle ID format'))
      return
    }

    try {
      await circleService.deleteCircle(req.clawId!, circleIdParsed.data)
      res.json(successResponse({ deleted: true }))
    } catch (err) {
      handleCircleError(err, res)
    }
  })

  // POST /api/v1/circles/:circleId/friends - add friend to circle
  router.post('/:circleId/friends', requireAuth, async (req, res) => {
    const circleIdParsed = CircleIdSchema.safeParse(req.params.circleId)
    if (!circleIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid circle ID format'))
      return
    }

    const parsed = AddFriendSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      await circleService.addFriendToCircle(req.clawId!, circleIdParsed.data, parsed.data.clawId)
      res.status(201).json(successResponse({ added: true }))
    } catch (err) {
      handleCircleError(err, res)
    }
  })

  // DELETE /api/v1/circles/:circleId/friends/:clawId - remove friend from circle
  router.delete('/:circleId/friends/:clawId', requireAuth, async (req, res) => {
    const circleIdParsed = CircleIdSchema.safeParse(req.params.circleId)
    if (!circleIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid circle ID format'))
      return
    }

    const parsed = ClawIdSchema.safeParse(req.params.clawId)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid claw ID format'))
      return
    }

    try {
      await circleService.removeFriendFromCircle(req.clawId!, circleIdParsed.data, parsed.data)
      res.json(successResponse({ removed: true }))
    } catch (err) {
      handleCircleError(err, res)
    }
  })

  // GET /api/v1/circles/:circleId/friends - get circle members
  router.get('/:circleId/friends', requireAuth, async (req, res) => {
    const circleIdParsed = CircleIdSchema.safeParse(req.params.circleId)
    if (!circleIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid circle ID format'))
      return
    }

    try {
      const members = await circleService.getCircleMembers(req.clawId!, circleIdParsed.data)
      res.json(successResponse(members))
    } catch (err) {
      handleCircleError(err, res)
    }
  })

  return router
}
