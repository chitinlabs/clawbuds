/**
 * Admin API Routes（Phase 12c）
 * 全部需要 CLAWBUDS_ADMIN_KEY 认证（Authorization: Bearer <key>）
 *
 * GET  /admin/health/detail          — 完整健康状态（DB、Cache、Realtime）
 * GET  /admin/claws                  — Claw 列表（分页 + 搜索）
 * GET  /admin/claws/:id              — 单个 Claw 详情
 * PATCH /admin/claws/:id/status      — 更改 Claw 状态（active/suspended）
 * GET  /admin/stats/overview         — 系统统计概览
 * GET  /admin/webhooks/deliveries    — 全局 Webhook 投递日志
 * GET  /admin/reflexes/stats         — ReflexEngine 全局执行统计
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '../lib/response.js'
import { createAdminAuthMiddleware } from '../middleware/admin-auth.js'
import type { IClawRepository } from '../db/repositories/interfaces/claw.repository.interface.js'
import type { IMessageRepository } from '../db/repositories/interfaces/message.repository.interface.js'
import type { IWebhookRepository } from '../db/repositories/interfaces/webhook.repository.interface.js'
import type { IReflexExecutionRepository } from '../db/repositories/interfaces/reflex.repository.interface.js'
import type { ICacheService } from '../cache/interfaces/cache.interface.js'
import type { IRealtimeService } from '../realtime/interfaces/realtime.interface.js'

export interface AdminRouterDeps {
  clawRepository: IClawRepository
  messageRepository: IMessageRepository
  webhookRepository: IWebhookRepository
  reflexExecutionRepository: IReflexExecutionRepository
  cacheService?: ICacheService
  realtimeService?: IRealtimeService
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router()
  const requireAdmin = createAdminAuthMiddleware()

  const {
    clawRepository,
    messageRepository,
    webhookRepository,
    reflexExecutionRepository,
    cacheService,
    realtimeService,
  } = deps

  // ─── GET /admin/health/detail ─────────────────────────────────────────

  router.get('/health/detail', requireAdmin, async (_req, res) => {
    try {
      // DB 连接检测：查询 claw 总数
      let dbStatus: 'ok' | 'error' = 'ok'
      let dbMessage: string | undefined
      try {
        await clawRepository.count()
      } catch (e) {
        dbStatus = 'error'
        dbMessage = e instanceof Error ? e.message : 'DB check failed'
      }

      // Cache 检测：尝试 ping
      let cacheStatus: 'ok' | 'unavailable' = 'unavailable'
      if (cacheService) {
        try {
          await cacheService.set('__admin_ping__', '1', 5)
          await cacheService.get('__admin_ping__')
          cacheStatus = 'ok'
        } catch {
          cacheStatus = 'unavailable'
        }
      }

      // Realtime 检测
      let realtimeStatus: 'ok' | 'unavailable' = 'unavailable'
      if (realtimeService) {
        try {
          await realtimeService.ping?.()
          realtimeStatus = 'ok'
        } catch {
          realtimeStatus = 'unavailable'
        }
      }

      res.json(successResponse({
        db: { status: dbStatus, message: dbMessage },
        cache: { status: cacheStatus },
        realtime: { status: realtimeStatus },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Health check failed'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── GET /admin/claws ─────────────────────────────────────────────────

  router.get('/claws', requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 100)
      const offset = parseInt(String(req.query['offset'] ?? '0'), 10)
      const search = req.query['search'] ? String(req.query['search']) : undefined

      const [claws, total] = await Promise.all([
        clawRepository.findPage({ offset, limit, search }),
        clawRepository.count(),
      ])

      res.json(successResponse({ claws, total, limit, offset }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list claws'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── GET /admin/claws/:id ─────────────────────────────────────────────

  router.get('/claws/:id', requireAdmin, async (req, res) => {
    try {
      const claw = await clawRepository.findById(req.params['id'] as string)
      if (!claw) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
        return
      }
      res.json(successResponse(claw))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get claw'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── PATCH /admin/claws/:id/status ───────────────────────────────────

  router.patch('/claws/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body ?? {}
    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'status must be "active" or "suspended"'))
      return
    }

    try {
      const claw = await clawRepository.findById(req.params['id'] as string)
      if (!claw) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Claw not found'))
        return
      }

      const updated = await clawRepository.updateStatus(req.params['id'] as string, status as 'active' | 'suspended' | 'deactivated')
      res.json(successResponse(updated))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update claw status'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── GET /admin/stats/overview ────────────────────────────────────────

  router.get('/stats/overview', requireAdmin, async (_req, res) => {
    try {
      const [totalClaws, totalMessages] = await Promise.all([
        clawRepository.count(),
        messageRepository.count(),
      ])
      res.json(successResponse({ totalClaws, totalMessages }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get stats'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── GET /admin/webhooks/deliveries ──────────────────────────────────

  router.get('/webhooks/deliveries', requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 500)
      const deliveries = await webhookRepository.findAllDeliveries(limit)
      res.json(successResponse({ deliveries }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get deliveries'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  // ─── GET /admin/reflexes/stats ────────────────────────────────────────

  router.get('/reflexes/stats', requireAdmin, async (_req, res) => {
    try {
      const stats = await reflexExecutionRepository.countGlobal()
      res.json(successResponse(stats))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get reflex stats'
      res.status(500).json(errorResponse('INTERNAL_ERROR', message))
    }
  })

  return router
}
