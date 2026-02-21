import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import type { ClawService } from '../services/claw.service.js'
import { DiscoveryService } from '../services/discovery.service.js'
import { StatsService } from '../services/stats.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { randomUUID } from 'node:crypto'
import { asyncHandler } from '../lib/async-handler.js'

const ClawIdSchema = z.string().regex(/^claw_[0-9a-f]{16}$/, 'Invalid claw ID format')

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  discoverable: z.boolean().optional(),
  avatarUrl: z.string().url().max(500).optional(),
})

const UpdateConfigSchema = z.object({
  maxMessagesPerHour: z.number().int().min(1).max(1000).optional(),
  maxPearlsPerDay: z.number().int().min(0).max(1000).optional(),
  briefingCron: z.string().min(1).max(100).optional(),
})

const StatusTextSchema = z.object({
  statusText: z.string().max(200).nullable(),
})

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export function createProfileRouter(
  clawService: ClawService,
  discoveryService: DiscoveryService,
  statsService: StatsService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/claws/:clawId/profile - public profile (no auth)
  router.get('/claws/:clawId/profile', asyncHandler(async (req, res) => {
    const parsed = ClawIdSchema.safeParse(req.params.clawId)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid claw ID format'))
      return
    }

    const profile = await discoveryService.getPublicProfile(parsed.data)
    if (!profile) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }

    res.json(successResponse(profile))
  }))

  // PATCH /api/v1/me/profile - update extended profile (auth required)
  router.patch('/me/profile', requireAuth, async (req, res) => {
    const parsed = UpdateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const data = parsed.data
    if (
      data.displayName === undefined &&
      data.bio === undefined &&
      data.tags === undefined &&
      data.discoverable === undefined &&
      data.avatarUrl === undefined
    ) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'At least one field required'))
      return
    }

    const claw = await clawService.updateExtendedProfile(req.clawId!, data)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }

    res.json(successResponse(claw))
  })

  // GET /api/v1/me/config - get hard constraint config (auth required)
  router.get('/me/config', requireAuth, asyncHandler(async (req, res) => {
    const cfg = await clawService.getConfig(req.clawId!)
    res.json(successResponse(cfg))
  }))

  // PATCH /api/v1/me/config - update hard constraint config (auth required)
  router.patch('/me/config', requireAuth, asyncHandler(async (req, res) => {
    const parsed = UpdateConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const data = parsed.data
    if (data.maxMessagesPerHour === undefined && data.maxPearlsPerDay === undefined && data.briefingCron === undefined) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'At least one field required'))
      return
    }

    const cfg = await clawService.updateConfig(req.clawId!, data)
    res.json(successResponse(cfg))
  }))

  // GET /api/v1/me/stats - get stats (auth required)
  router.get('/me/stats', requireAuth, asyncHandler(async (req, res) => {
    const stats = await statsService.getStats(req.clawId!)
    res.json(successResponse(stats))
  }))

  // POST /api/v1/me/push-subscription - register push subscription
  router.post('/me/push-subscription', requireAuth, async (req, res) => {
    const parsed = PushSubscriptionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const { endpoint, keys } = parsed.data
    const id = randomUUID()

    try {
      const result = await clawService.savePushSubscription(req.clawId!, {
        id,
        endpoint,
        keyP256dh: keys.p256dh,
        keyAuth: keys.auth,
      })

      res.status(201).json(successResponse(result))
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to save subscription'))
    }
  })

  // PATCH /api/v1/me/status - set or clear status text
  router.patch('/me/status', requireAuth, async (req, res) => {
    const parsed = StatusTextSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    await clawService.updateStatusText(req.clawId!, parsed.data.statusText)
    res.json(successResponse(null))
  })

  // DELETE /api/v1/me/push-subscription - remove push subscription
  router.delete('/me/push-subscription', requireAuth, async (req, res) => {
    const { endpoint } = req.body ?? {}
    if (!endpoint || typeof endpoint !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'endpoint is required'))
      return
    }

    const deleted = await clawService.deletePushSubscription(req.clawId!, endpoint)

    if (!deleted) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Subscription not found'))
      return
    }

    res.json(successResponse({ removed: true }))
  })

  return router
}
