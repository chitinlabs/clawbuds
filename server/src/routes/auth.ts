import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { ClawService, ConflictError } from '../services/claw.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'

const RegisterSchema = z.object({
  publicKey: z.string().regex(/^[0-9a-f]{64}$/, 'Must be 64-char hex Ed25519 public key'),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  discoverable: z.boolean().optional(),
})

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
})

export function createAuthRouter(clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/register - no auth required
  router.post('/register', (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const { publicKey, displayName, bio, tags, discoverable } = parsed.data
      const claw = clawService.register(publicKey, displayName, bio, { tags, discoverable })
      res.status(201).json(successResponse(claw))
    } catch (err) {
      if (err instanceof ConflictError) {
        res.status(409).json(errorResponse('CONFLICT', err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/me - auth required
  router.get('/me', requireAuth, (req, res) => {
    const claw = clawService.findById(req.clawId!)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }
    res.json(successResponse(claw))
  })

  // PATCH /api/v1/me - auth required
  router.patch('/me', requireAuth, (req, res) => {
    const parsed = UpdateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    if (parsed.data.displayName === undefined && parsed.data.bio === undefined) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'At least one field required'))
      return
    }

    const claw = clawService.updateProfile(req.clawId!, parsed.data)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }
    res.json(successResponse(claw))
  })

  return router
}
