/**
 * Relationships API Routes（Phase 1）
 * GET /api/v1/relationships
 * GET /api/v1/relationships/at-risk
 */

import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { RelationshipService } from '../services/relationship.service.js'
import type { ClawService } from '../services/claw.service.js'

const VALID_LAYERS = ['core', 'sympathy', 'active', 'casual'] as const
const LayerSchema = z.enum(VALID_LAYERS)

export function createRelationshipsRouter(
  relationshipService: RelationshipService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/relationships — 按 Dunbar 层级获取好友列表
  router.get('/', requireAuth, async (req, res) => {
    const clawId = req.clawId!
    const layerParam = req.query.layer as string | undefined

    if (layerParam !== undefined) {
      const parsed = LayerSchema.safeParse(layerParam)
      if (!parsed.success) {
        res.status(400).json(errorResponse('VALIDATION_ERROR', `Invalid layer. Must be one of: ${VALID_LAYERS.join(', ')}`))
        return
      }
      // 获取所有层级，只返回指定层级
      const allLayers = await relationshipService.getFriendsByLayer(clawId)
      res.json(successResponse({ [parsed.data]: allLayers[parsed.data] }))
      return
    }

    // 返回所有层级
    const allLayers = await relationshipService.getFriendsByLayer(clawId)
    res.json(successResponse(allLayers))
  })

  // GET /api/v1/relationships/at-risk — 获取濒临降层的关系
  router.get('/at-risk', requireAuth, async (req, res) => {
    const clawId = req.clawId!

    const atRisk = await relationshipService.getAtRiskRelationships(clawId)
    res.json(successResponse(atRisk))
  })

  // PATCH /api/v1/relationships/:friendId/layer — 手动覆盖 Dunbar 层级（T9）
  const SetLayerSchema = z.object({
    layer: z.enum(VALID_LAYERS),
  })

  router.patch('/:friendId/layer', requireAuth, async (req, res) => {
    const clawId = req.clawId!
    const friendId = req.params.friendId as string

    const parsed = SetLayerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', `layer must be one of: ${VALID_LAYERS.join(', ')}`))
      return
    }

    try {
      await relationshipService.setManualLayer(clawId, friendId, parsed.data.layer)
      res.json(successResponse({ friendId, layer: parsed.data.layer }))
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found') || msg.includes('not friends')) {
        res.status(404).json(errorResponse('NOT_FOUND', msg))
      } else {
        res.status(500).json(errorResponse('INTERNAL_ERROR', msg))
      }
    }
  })

  return router
}
