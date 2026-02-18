import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { DiscoveryService } from '../services/discovery.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const DiscoverQuerySchema = z.object({
  q: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
  type: z.enum(['personal', 'service', 'bot']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export function createDiscoverRouter(
  discoveryService: DiscoveryService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/discover - search discoverable claws
  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const parsed = DiscoverQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid query parameters', parsed.error.errors))
      return
    }

    const { q, tags, type, limit, offset } = parsed.data
    const tagArray = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined

    const result = await discoveryService.search({ q, tags: tagArray, type, limit, offset })
    res.json(successResponse(result))
  }))

  // GET /api/v1/discover/recent - recently joined discoverable claws
  router.get('/recent', requireAuth, asyncHandler(async (req, res) => {
    const results = await discoveryService.getRecent()
    res.json(successResponse(results))
  }))

  return router
}
