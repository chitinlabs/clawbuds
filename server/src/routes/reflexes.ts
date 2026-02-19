/**
 * Reflex API Routes（Phase 4）
 * GET    /api/v1/reflexes                     — 列出 Reflex
 * GET    /api/v1/reflexes/executions           — 获取执行记录（⚠️ 必须在 /:name 之前注册）
 * PATCH  /api/v1/reflexes/:name/enable         — 启用 Reflex
 * PATCH  /api/v1/reflexes/:name/disable        — 禁用 Reflex
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ReflexEngine } from '../services/reflex-engine.js'
import type { ClawService } from '../services/claw.service.js'
import type { ExecutionResult } from '../db/repositories/interfaces/reflex.repository.interface.js'

const VALID_EXECUTION_RESULTS: ExecutionResult[] = ['executed', 'recommended', 'blocked', 'queued_for_l1']
// Reflex name: only lowercase letters, digits, underscores; max 100 chars
const REFLEX_NAME_RE = /^[a-z0-9_]{1,100}$/

export function createReflexesRouter(reflexEngine: ReflexEngine, clawService: ClawService): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/reflexes/executions — 获取最近执行记录（⚠️ 必须在 /:name 之前）
  router.get('/executions', requireAuth, async (req, res) => {
    const qLimit = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined
    const qResult = (Array.isArray(req.query.result) ? req.query.result[0] : req.query.result) as string | undefined
    const qSince = (Array.isArray(req.query.since) ? req.query.since[0] : req.query.since) as string | undefined

    // Validate limit
    const parsedLimit = qLimit ? parseInt(qLimit, 10) : 50
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, 200)

    // Validate result
    if (qResult && !VALID_EXECUTION_RESULTS.includes(qResult as ExecutionResult)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', `result must be one of: ${VALID_EXECUTION_RESULTS.join(', ')}`))
      return
    }

    // Validate since
    if (qSince) {
      const sinceDate = new Date(qSince)
      if (isNaN(sinceDate.getTime())) {
        res.status(400).json(errorResponse('VALIDATION_ERROR', 'since must be a valid ISO 8601 date'))
        return
      }
    }

    try {
      let executions
      if (qResult) {
        // Push filtering to the database layer to avoid in-memory post-fetch truncation
        executions = await reflexEngine.getFilteredExecutions(
          req.clawId as string,
          qResult as ExecutionResult,
          qSince,
          limit,
        )
      } else {
        executions = await reflexEngine.getRecentExecutions(req.clawId as string, limit)
        if (qSince) {
          executions = executions.filter((e) => e.createdAt >= qSince!)
        }
      }

      res.json({
        success: true,
        data: executions,
        meta: { total: executions.length, limit },
      })
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
    }
  })

  // GET /api/v1/reflexes — 列出 Reflex（支持 layer / enabled 过滤）
  router.get('/', requireAuth, async (req, res) => {
    const qLayer = (Array.isArray(req.query.layer) ? req.query.layer[0] : req.query.layer) as string | undefined
    const qEnabled = (Array.isArray(req.query.enabled) ? req.query.enabled[0] : req.query.enabled) as string | undefined

    // Validate layer: must be exactly 0 or 1 if provided
    let layer: 0 | 1 | undefined
    if (qLayer !== undefined) {
      const parsedLayer = parseInt(qLayer, 10)
      if (parsedLayer !== 0 && parsedLayer !== 1) {
        res.status(400).json(errorResponse('VALIDATION_ERROR', 'layer must be 0 or 1'))
        return
      }
      layer = parsedLayer as 0 | 1
    }

    const enabledOnly = qEnabled !== 'false'  // default: only enabled

    try {
      const reflexes = await reflexEngine.listReflexes(req.clawId as string, {
        layer,
        enabledOnly,
      })
      res.json(successResponse(reflexes))
    } catch {
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
    }
  })

  // PATCH /api/v1/reflexes/:name/enable — 启用 Reflex
  router.patch('/:name/enable', requireAuth, async (req, res) => {
    const name = req.params.name as string

    if (!REFLEX_NAME_RE.test(name)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid reflex name format'))
      return
    }

    try {
      await reflexEngine.enableReflex(req.clawId as string, name)
      res.json(successResponse(null))
    } catch (err: any) {
      if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Reflex not found'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
      }
    }
  })

  // PATCH /api/v1/reflexes/:name/disable — 禁用 Reflex
  router.patch('/:name/disable', requireAuth, async (req, res) => {
    const name = req.params.name as string

    if (!REFLEX_NAME_RE.test(name)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid reflex name format'))
      return
    }

    try {
      await reflexEngine.disableReflex(req.clawId as string, name)
      res.json(successResponse(null))
    } catch (err: any) {
      if (err.code === 'FORBIDDEN') {
        res.status(400).json(errorResponse('FORBIDDEN', err.message))
      } else if (err.code === 'NOT_FOUND') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Reflex not found'))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'))
      }
    }
  })

  return router
}
