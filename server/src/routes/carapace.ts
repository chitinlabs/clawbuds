/**
 * Carapace History API Routes（Phase 10 + Phase 12b）
 * GET  /api/v1/carapace/history          — 获取 carapace.md 修改历史
 * GET  /api/v1/carapace/history/:version — 获取指定版本
 * POST /api/v1/carapace/restore/:version — 返回版本内容（客户端负责写文件）
 * GET  /api/v1/carapace/content          — 读取 DB 最新快照
 * POST /api/v1/carapace/snapshot         — 接收客户端推送的最新快照（Phase 12b）
 * GET  /api/v1/pattern-health            — 获取模式健康评分
 * POST /api/v1/micromolt/apply           — 应用指定的 Micro-Molt 建议
 */

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { successResponse, errorResponse } from '../lib/response.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { ICarapaceHistoryRepository, CarapaceChangeReason } from '../db/repositories/interfaces/carapace-history.repository.interface.js'
import type { PatternStalenessDetector } from '../services/pattern-staleness-detector.js'
import type { MicroMoltService } from '../services/micro-molt.service.js'
import type { BriefingService } from '../services/briefing.service.js'

const VALID_SNAPSHOT_REASONS = ['allow', 'escalate', 'restore', 'manual'] as const
type SnapshotReason = typeof VALID_SNAPSHOT_REASONS[number]

// 将 API 传入的 reason 映射为 CarapaceChangeReason
function toChangeReason(reason: SnapshotReason): CarapaceChangeReason {
  return reason === 'manual' ? 'manual_edit' : reason
}

export function createCarapaceRouter(
  carapaceHistoryRepo: ICarapaceHistoryRepository,
  stalenessDetector: PatternStalenessDetector,
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

  // POST /api/v1/carapace/restore/:version（Phase 12b: 返回内容，客户端负责写本地文件）
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

      // Phase 12b: 只返回内容，不写文件（文件操作移到客户端）
      res.json(successResponse({ content: target.content, version: target.version }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get carapace version'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // GET /api/v1/carapace/content（Phase 12b: 读取 DB 最新快照，不再依赖文件系统）
  router.get('/content', requireAuth, async (req, res) => {
    try {
      const clawId = req.clawId as string
      const latest = await carapaceHistoryRepo.getLatestVersion(clawId)
      if (!latest) {
        res.json(successResponse({ content: '' }))
        return
      }
      const record = await carapaceHistoryRepo.findByVersion(clawId, latest)
      res.json(successResponse({ content: record?.content ?? '' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read carapace'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // POST /api/v1/carapace/snapshot（Phase 12b: 接收客户端推送的快照）
  router.post('/snapshot', requireAuth, async (req, res) => {
    const { content, reason } = req.body ?? {}
    if (typeof content !== 'string') {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'content is required and must be a string'))
      return
    }
    const snapshotReason: SnapshotReason = VALID_SNAPSHOT_REASONS.includes(reason) ? reason : 'manual'

    try {
      const clawId = req.clawId as string
      await carapaceHistoryRepo.create({
        id: randomUUID(),
        clawId,
        content,
        changeReason: toChangeReason(snapshotReason),
        suggestedBy: 'user',
      })
      const newVersion = await carapaceHistoryRepo.getLatestVersion(clawId)
      res.json(successResponse({ version: newVersion, createdAt: new Date().toISOString() }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save carapace snapshot'
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
