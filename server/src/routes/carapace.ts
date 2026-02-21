/**
 * Carapace History API Routes（Phase 10）
 * GET  /api/v1/carapace/history          — 获取 carapace.md 修改历史
 * GET  /api/v1/carapace/history/:version — 获取指定版本
 * POST /api/v1/carapace/restore/:version — 回滚到指定版本
 * GET  /api/v1/pattern-health            — 获取模式健康评分
 * POST /api/v1/micromolt/apply           — 应用指定的 Micro-Molt 建议
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { ICarapaceHistoryRepository } from '../db/repositories/interfaces/carapace-history.repository.interface.js'
import type { PatternStalenessDetector } from '../services/pattern-staleness-detector.js'
import type { CarapaceEditor } from '../services/carapace-editor.js'
import type { MicroMoltService } from '../services/micro-molt.service.js'
import type { BriefingService } from '../services/briefing.service.js'

export function createCarapaceRouter(
  carapaceHistoryRepo: ICarapaceHistoryRepository,
  stalenessDetector: PatternStalenessDetector,
  carapaceEditor: CarapaceEditor | null,
  microMoltService: MicroMoltService,
  briefingService: BriefingService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/carapace/history
  router.get('/history', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 50)
      const offset = parseInt(String(req.query['offset'] ?? '0'), 10)

      const records = await carapaceHistoryRepo.findByOwner(clawId, { limit, offset })
      const latestVersion = await carapaceHistoryRepo.getLatestVersion(clawId)

      // count = 当前页返回条数，latestVersion 可作为总版本数代理
      res.json({ success: true, data: records, meta: { count: records.length, latestVersion } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get carapace history'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/carapace/history/:version
  router.get('/history/:version', requireAuth, async (req, res) => {
    const version = parseInt(req.params['version'] as string, 10)
    if (isNaN(version)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'version must be a number'))
      return
    }

    try {
      const clawId = req.clawId as string
      const record = await carapaceHistoryRepo.findByVersion(clawId, version)
      if (!record) {
        res.status(404).json(errorResponse('NOT_FOUND', `Version ${version} not found`))
        return
      }
      res.json(successResponse(record))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get carapace version'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/carapace/restore/:version
  router.post('/restore/:version', requireAuth, async (req, res) => {
    const version = parseInt(req.params['version'] as string, 10)
    if (isNaN(version)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'version must be a number'))
      return
    }

    try {
      const clawId = req.clawId as string
      const target = await carapaceHistoryRepo.findByVersion(clawId, version)
      if (!target) {
        res.status(404).json(errorResponse('NOT_FOUND', `Version ${version} not found`))
        return
      }

      if (!carapaceEditor) {
        res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'CarapaceEditor not configured'))
        return
      }

      await carapaceEditor.restoreVersion(clawId, version)
      const newVersion = await carapaceHistoryRepo.getLatestVersion(clawId)
      res.json(successResponse({ restoredVersion: version, newVersion }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore carapace version'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}

export function createPatternHealthRouter(
  stalenessDetector: PatternStalenessDetector,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/pattern-health
  router.get('/', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const [healthScore, alerts] = await Promise.all([
        stalenessDetector.computeHealthScore(clawId),
        stalenessDetector.detect(clawId),
      ])
      res.json(successResponse({ healthScore, alerts }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compute pattern health'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}

export function createMicroMoltApplyRouter(
  microMoltService: MicroMoltService,
  briefingService: BriefingService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/micromolt/apply
  router.post('/apply', requireAuth, async (req, res) => {
    const { suggestionIndex, confirmed, expectedCommand } = req.body ?? {}

    if (confirmed !== true) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'confirmed must be true'))
      return
    }

    if (typeof suggestionIndex !== 'number' || suggestionIndex < 0) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'suggestionIndex must be a non-negative number'))
      return
    }

    try {
      const clawId = req.clawId as string
      // 获取当前建议列表
      const suggestions = await microMoltService.generateSuggestions(clawId)
      if (suggestionIndex >= suggestions.length) {
        res.status(400).json(errorResponse('NOT_FOUND', `Suggestion index ${suggestionIndex} out of range (total: ${suggestions.length})`))
        return
      }

      const suggestion = suggestions[suggestionIndex]

      // MEDIUM-4: 若客户端提供 expectedCommand，验证建议内容未在两次调用之间发生变化
      if (expectedCommand !== undefined && suggestion.cliCommand !== expectedCommand) {
        res.status(409).json(errorResponse('CONFLICT', 'Suggestion list has changed since you last fetched it, please refresh'))
        return
      }

      await microMoltService.applySuggestion(clawId, suggestion)
      res.json(successResponse({ appliedSuggestion: suggestion }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply suggestion'
      if (message.includes('CarapaceEditor 未注入')) {
        res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', message))
        return
      }
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}
