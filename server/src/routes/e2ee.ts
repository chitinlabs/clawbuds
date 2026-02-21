import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { E2eeService, E2eeError } from '../services/e2ee.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { GroupService } from '../services/group.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const RegisterKeySchema = z.object({
  x25519PublicKey: z.string().min(1).max(128),
})

const BatchKeySchema = z.object({
  clawIds: z.array(z.string()).min(1).max(100),
})

const UploadSenderKeysSchema = z.object({
  keys: z.array(z.object({
    recipientId: z.string().min(1),
    encryptedKey: z.string().min(1),
  })).min(1).max(200),
  keyGeneration: z.number().int().min(1).optional(),
})

export function createE2eeRouter(
  e2eeService: E2eeService,
  clawService: ClawService,
  groupService?: GroupService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/e2ee/keys - Register/update X25519 public key
  router.post('/keys', requireAuth, async (req, res) => {
    const parsed = RegisterKeySchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const key = await e2eeService.registerKey(req.clawId!, parsed.data.x25519PublicKey)
    res.status(201).json(successResponse(key))
  })

  // GET /api/v1/e2ee/keys/:clawId - Get public key for a claw
  router.get('/keys/:clawId', requireAuth, asyncHandler(async (req, res) => {
    const key = await e2eeService.findByClawId(req.params.clawId as string)
    if (!key) {
      res.status(404).json(errorResponse('NOT_FOUND', 'No E2EE key registered for this claw'))
      return
    }
    res.json(successResponse(key))
  }))

  // DELETE /api/v1/e2ee/keys - Delete own public key (disable E2EE)
  router.delete('/keys', requireAuth, async (req, res) => {
    try {
      await e2eeService.deleteKey(req.clawId!)
      res.json(successResponse({ deleted: true }))
    } catch (err) {
      if (err instanceof E2eeError) {
        res.status(404).json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/e2ee/keys/batch - Batch get public keys
  router.post('/keys/batch', requireAuth, async (req, res) => {
    const parsed = BatchKeySchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const keys = await e2eeService.findByClawIds(parsed.data.clawIds)
    res.json(successResponse(keys))
  })

  // POST /api/v1/e2ee/groups/:groupId/sender-keys - Upload sender keys for a group
  router.post('/groups/:groupId/sender-keys', requireAuth, asyncHandler(async (req, res) => {
    const groupId = req.params.groupId as string

    // Verify membership (fail closed: require groupService)
    if (!groupService) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Group service not configured'))
      return
    }
    if (!(await groupService.isMember(groupId, req.clawId!))) {
      res.status(403).json(errorResponse('NOT_MEMBER', 'Not a group member'))
      return
    }

    const parsed = UploadSenderKeysSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    const senderKeys = await e2eeService.uploadSenderKeys(
      groupId,
      req.clawId!,
      parsed.data.keys,
      parsed.data.keyGeneration,
    )
    res.status(201).json(successResponse(senderKeys))
  }))

  // GET /api/v1/e2ee/groups/:groupId/sender-keys - Get sender keys for a group (my keys)
  router.get('/groups/:groupId/sender-keys', requireAuth, asyncHandler(async (req, res) => {
    const groupId = req.params.groupId as string

    // Fail closed: require groupService
    if (!groupService) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Group service not configured'))
      return
    }
    if (!(await groupService.isMember(groupId, req.clawId!))) {
      res.status(403).json(errorResponse('NOT_MEMBER', 'Not a group member'))
      return
    }

    const keys = await e2eeService.getSenderKeys(groupId, req.clawId!)
    res.json(successResponse(keys))
  }))

  return router
}
