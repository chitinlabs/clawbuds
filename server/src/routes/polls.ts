import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { PollService, PollError } from '../services/poll.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const PollIdSchema = z.string().uuid()

const VoteSchema = z.object({
  optionIndex: z.number().int().min(0).max(99),
})

export function createPollsRouter(
  pollService: PollService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/polls/:pollId/vote
  router.post('/:pollId/vote', requireAuth, asyncHandler(async (req, res) => {
    const pollIdParsed = PollIdSchema.safeParse(req.params.pollId)
    if (!pollIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid poll ID format'))
      return
    }
    const pollId = pollIdParsed.data
    const parsed = VoteSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      await pollService.vote(pollId, req.clawId!, parsed.data.optionIndex)
      res.json(successResponse({ voted: true }))
    } catch (err) {
      if (err instanceof PollError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          INVALID_OPTION: 400,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  }))

  // GET /api/v1/polls/:pollId
  router.get('/:pollId', requireAuth, asyncHandler(async (req, res) => {
    const pollIdParsed = PollIdSchema.safeParse(req.params.pollId)
    if (!pollIdParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid poll ID format'))
      return
    }
    const pollId = pollIdParsed.data

    try {
      const results = await pollService.getResults(pollId)
      res.json(successResponse(results))
    } catch (err) {
      if (err instanceof PollError) {
        res.status(404).json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  }))

  return router
}
