/**
 * Carapace History API Routes（Phase 10 + Phase 11）
 * GET  /api/v1/carapace/history          — 获取 carapace.md 修改历史
 * GET  /api/v1/carapace/history/:version — 获取指定版本
 * POST /api/v1/carapace/restore/:version — 回滚到指定版本
 * GET  /api/v1/carapace/content          — 获取当前 carapace.md 内容（Phase 11 T3）
 * POST /api/v1/carapace/allow            — 追加授权规则（Phase 11 T3）
 * POST /api/v1/carapace/escalate         — 追加升级规则（Phase 11 T3）
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

  // GET /api/v1/carapace/content（Phase 11 T3）
  router.get('/content', requireAuth, async (req, res) => {
    if (!carapaceEditor) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'CarapaceEditor not configured (set CLAWBUDS_CARAPACE_PATH)'))
      return
    }
    try {
      const content = await carapaceEditor.getContent()
      res.json(successResponse({ content }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read carapace'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/carapace/allow（Phase 11 T3）
  router.post('/allow', requireAuth, async (req, res) => {
    const { friendId, scope, note } = req.body ?? {}
    if (!friendId || typeof friendId !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'friendId is required'))
      return
    }
    if (!scope || typeof scope !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'scope is required'))
      return
    }
    if (friendId.length > 200 || scope.length > 500 || (note && note.length > 500)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Input exceeds maximum length'))
      return
    }
    if (!carapaceEditor) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'CarapaceEditor not configured'))
      return
    }
    try {
      const clawId = req.clawId as string
      await carapaceEditor.allow(clawId, friendId, scope, note)
      const newVersion = await carapaceHistoryRepo.getLatestVersion(clawId)
      res.json(successResponse({ newVersion }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add allow rule'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/carapace/escalate（Phase 11 T3）
  router.post('/escalate', requireAuth, async (req, res) => {
    const { condition, action } = req.body ?? {}
    if (!condition || typeof condition !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'condition is required'))
      return
    }
    if (!action || typeof action !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'action is required'))
      return
    }
    if (condition.length > 500 || action.length > 500) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Input exceeds maximum length'))
      return
    }
    if (!carapaceEditor) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'CarapaceEditor not configured'))
      return
    }
    try {
      const clawId = req.clawId as string
      await carapaceEditor.escalate(clawId, condition, action)
      const newVersion = await carapaceHistoryRepo.getLatestVersion(clawId)
      res.json(successResponse({ newVersion }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add escalate rule'
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
