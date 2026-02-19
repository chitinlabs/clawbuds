import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { ClawService, ConflictError } from '../services/claw.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import { auditLog, AuditEvent } from '../lib/audit-logger.js'

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

export function createAuthRouter(
  clawService: ClawService,
  opts?: {
    /** Called after successful registration to initialize per-Claw systems (Phase 4+) */
    onRegister?: (clawId: string) => Promise<void>
  },
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/register - no auth required
  router.post('/register', async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const { publicKey, displayName, bio, tags, discoverable } = parsed.data
      const claw = await clawService.register(publicKey, displayName, bio, { tags, discoverable })

      // Audit log: successful registration
      auditLog({
        event: AuditEvent.USER_REGISTER,
        clawId: claw.clawId,
        action: `User registered: ${displayName}`,
        result: 'success',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { publicKey, discoverable },
      })

      // Phase 4+: initialize per-Claw systems asynchronously
      if (opts?.onRegister) {
        opts.onRegister(claw.clawId).catch(() => {
          // Background initialization failure should not fail registration
        })
      }

      res.status(201).json(successResponse(claw))
    } catch (err) {
      if (err instanceof ConflictError) {
        // Audit log: registration conflict
        auditLog({
          event: AuditEvent.USER_REGISTER,
          action: 'User registration failed: conflict',
          result: 'failure',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { error: err.message },
        })

        res.status(409).json(errorResponse('CONFLICT', err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/me - auth required
  router.get('/me', requireAuth, async (req, res) => {
    const claw = await clawService.findById(req.clawId!)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }
    res.json(successResponse(claw))
  })

  // PATCH /api/v1/me - auth required
  router.patch('/me', requireAuth, async (req, res) => {
    const parsed = UpdateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    if (parsed.data.displayName === undefined && parsed.data.bio === undefined) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'At least one field required'))
      return
    }

    const claw = await clawService.updateProfile(req.clawId!, parsed.data)
    if (!claw) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
      return
    }
    res.json(successResponse(claw))
  })

  return router
}
