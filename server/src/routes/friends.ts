import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { FriendshipService, FriendshipError } from '../services/friendship.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'

const ClawIdSchema = z.string().regex(/^claw_[0-9a-f]{16}$/, 'Invalid claw ID format')

const FriendRequestSchema = z.object({
  clawId: ClawIdSchema,
})

const AcceptRejectSchema = z.object({
  friendshipId: z.string().uuid(),
})

export function createFriendsRouter(
  friendshipService: FriendshipService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/friends/request - send friend request
  router.post('/request', requireAuth, (req, res) => {
    const parsed = FriendRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const friendship = friendshipService.sendRequest(req.clawId!, parsed.data.clawId)
      res.status(201).json(successResponse(friendship))
    } catch (err) {
      if (err instanceof FriendshipError) {
        const statusMap: Record<string, number> = {
          SELF_REQUEST: 400,
          CLAW_NOT_FOUND: 404,
          ALREADY_FRIENDS: 409,
          DUPLICATE_REQUEST: 409,
          BLOCKED: 403,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/friends/requests - get pending requests
  router.get('/requests', requireAuth, (req, res) => {
    const requests = friendshipService.getPendingRequests(req.clawId!)
    res.json(successResponse(requests))
  })

  // POST /api/v1/friends/accept - accept friend request
  router.post('/accept', requireAuth, (req, res) => {
    const parsed = AcceptRejectSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const friendship = friendshipService.acceptRequest(req.clawId!, parsed.data.friendshipId)
      res.json(successResponse(friendship))
    } catch (err) {
      if (err instanceof FriendshipError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          NOT_AUTHORIZED: 403,
          INVALID_STATUS: 400,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/friends/reject - reject friend request
  router.post('/reject', requireAuth, (req, res) => {
    const parsed = AcceptRejectSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const friendship = friendshipService.rejectRequest(req.clawId!, parsed.data.friendshipId)
      res.json(successResponse(friendship))
    } catch (err) {
      if (err instanceof FriendshipError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          NOT_AUTHORIZED: 403,
          INVALID_STATUS: 400,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // DELETE /api/v1/friends/:clawId - remove friend
  router.delete('/:clawId', requireAuth, (req, res) => {
    const parsed = ClawIdSchema.safeParse(req.params.clawId)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid claw ID format'))
      return
    }

    try {
      friendshipService.removeFriend(req.clawId!, parsed.data)
      res.json(successResponse({ removed: true }))
    } catch (err) {
      if (err instanceof FriendshipError) {
        res.status(404).json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/friends - list friends
  router.get('/', requireAuth, (req, res) => {
    const friends = friendshipService.listFriends(req.clawId!)
    res.json(successResponse(friends))
  })

  return router
}
