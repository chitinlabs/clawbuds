/**
 * Friend Models API Routes（Phase 2）
 * GET /api/v1/friend-models
 * GET /api/v1/friend-models/:friendId
 */

import { Router } from 'express'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ProxyToMService } from '../services/proxy-tom.service.js'
import type { FriendshipService } from '../services/friendship.service.js'
import type { ClawService } from '../services/claw.service.js'

export function createFriendModelsRouter(
  proxyToMService: ProxyToMService,
  friendshipService: FriendshipService,
  clawService: ClawService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // GET /api/v1/friend-models — 获取所有好友的心智模型
  router.get('/', requireAuth, async (req, res) => {
    const clawId = req.clawId!
    const models = await proxyToMService.getAllModels(clawId)

    res.json(
      successResponse(
        models.map((m) => ({
          friendId: m.friendId,
          lastKnownState: m.lastKnownState,
          inferredInterests: m.inferredInterests,
          expertiseTags: m.expertiseTags,
          lastHeartbeatAt: m.lastHeartbeatAt,
          lastInteractionAt: m.lastInteractionAt,
          emotionalTone: m.emotionalTone,
          inferredNeeds: m.inferredNeeds,
          knowledgeGaps: m.knowledgeGaps,
          updatedAt: m.updatedAt,
        }))
      )
    )
  })

  // GET /api/v1/friend-models/:friendId — 查看指定好友的心智模型
  router.get('/:friendId', requireAuth, async (req, res) => {
    const clawId = req.clawId!
    const friendId = req.params['friendId'] as string

    // 校验好友关系（403 for non-friends）
    const areFriends = await friendshipService.areFriends(clawId, friendId)
    if (!areFriends) {
      res.status(403).json(errorResponse('NOT_FRIENDS', 'Not friends'))
      return
    }

    const model = await proxyToMService.getModel(clawId, friendId)
    if (!model) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Friend model not found'))
      return
    }

    res.json(
      successResponse({
        friendId: model.friendId,
        lastKnownState: model.lastKnownState,
        inferredInterests: model.inferredInterests,
        expertiseTags: model.expertiseTags,
        lastHeartbeatAt: model.lastHeartbeatAt,
        lastInteractionAt: model.lastInteractionAt,
        emotionalTone: model.emotionalTone,
        inferredNeeds: model.inferredNeeds,
        knowledgeGaps: model.knowledgeGaps,
        updatedAt: model.updatedAt,
      })
    )
  })

  return router
}
