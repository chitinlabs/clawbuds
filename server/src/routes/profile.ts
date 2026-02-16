import { Router } from 'express'
import { z } from 'zod'
import type Database from 'better-sqlite3'
import { successResponse, errorResponse } from '@clawbuds/shared'
import type { ClawService } from '../services/claw.service.js'
import { DiscoveryService } from '../services/discovery.service.js'
import { StatsService } from '../services/stats.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { randomUUID } from 'node:crypto'

const ClawIdSchema = z.string().regex(/^claw_[0-9a-f]{16}$/, 'Invalid claw ID format')

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  discoverable: z.boolean().optional(),
  avatarUrl: z.string().url().max(500).optional(),
})

const UpdateAutonomySchema = z.object({
  autonomyLevel: z.enum(['notifier', 'drafter', 'autonomous', 'delegator']).optional(),
  autonomyConfig: z.object({
    defaultLevel: z.enum(['notifier', 'drafter', 'autonomous', 'delegator']),
    perFriend: z.record(z.enum(['notifier', 'drafter', 'autonomous', 'delegator'])).optional(),
    escalationKeywords: z.array(z.string()).optional(),
  }).optional(),
})

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export function createProfileRouter(
  db: Database.Database,
  clawService: ClawService,
  discoveryService: DiscoveryService,
  statsService: StatsService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/claws/:clawId/profile - public profile (no auth)
  router.get('/claws/:clawId/profile', (req, res) => {
    const parsed = ClawIdSchema.safeParse(req.params.clawId)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid claw ID format'))
      return
    }

    const profile = discoveryService.getPublicProfile(parsed.data)
    if (!profile) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }

    res.json(successResponse(profile))
  })

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

  // GET /api/v1/me/autonomy - get autonomy config (auth required)
  router.get('/me/autonomy', requireAuth, async (req, res) => {
    const config = await clawService.getAutonomyConfig(req.clawId!)
    if (!config) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }

    res.json(successResponse(config))
  })

  // PATCH /api/v1/me/autonomy - update autonomy config (auth required)
  router.patch('/me/autonomy', requireAuth, async (req, res) => {
    const parsed = UpdateAutonomySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const data = parsed.data
    if (data.autonomyLevel === undefined && data.autonomyConfig === undefined) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'At least one field required'))
      return
    }

    const claw = await clawService.updateAutonomyConfig(req.clawId!, data)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }

    res.json(successResponse(claw))
  })

  // GET /api/v1/me/stats - get stats (auth required)
  router.get('/me/stats', requireAuth, (req, res) => {
    const stats = statsService.getStats(req.clawId!)
    res.json(successResponse(stats))
  })

  // POST /api/v1/me/push-subscription - register push subscription
  router.post('/me/push-subscription', requireAuth, (req, res) => {
    const parsed = PushSubscriptionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const { endpoint, keys } = parsed.data
    const id = randomUUID()

    try {
      db.prepare(
        `INSERT OR REPLACE INTO push_subscriptions (id, claw_id, endpoint, key_p256dh, key_auth)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, req.clawId!, endpoint, keys.p256dh, keys.auth)

      res.status(201).json(successResponse({ id, endpoint }))
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to save subscription'))
    }
  })

  // DELETE /api/v1/me/push-subscription - remove push subscription
  router.delete('/me/push-subscription', requireAuth, (req, res) => {
    const { endpoint } = req.body ?? {}
    if (!endpoint || typeof endpoint !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'endpoint is required'))
      return
    }

    const result = db.prepare(
      'DELETE FROM push_subscriptions WHERE claw_id = ? AND endpoint = ?',
    ).run(req.clawId!, endpoint)

    if (result.changes === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Subscription not found'))
      return
    }

    res.json(successResponse({ removed: true }))
  })

  return router
}
