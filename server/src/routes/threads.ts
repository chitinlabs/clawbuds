/**
 * Thread V5 API Routes（Phase 8）
 * POST   /api/v1/threads                           — 创建 Thread
 * GET    /api/v1/threads                           — 查询我的 Thread 列表
 * GET    /api/v1/threads/:id                       — 查看 Thread 详情
 * POST   /api/v1/threads/:id/contribute            — 提交贡献（E2EE）
 * GET    /api/v1/threads/:id/contributions         — 获取贡献历史
 * POST   /api/v1/threads/:id/invite                — 邀请好友加入
 * POST   /api/v1/threads/:id/digest                — 请求 AI 个性化摘要
 * PATCH  /api/v1/threads/:id/status                — 更新 Thread 状态
 * GET    /api/v1/threads/:id/my-key                — 获取当前用户的密钥份额（E2EE）
 */

import { Router, type Response } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '@clawbuds/shared'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ThreadService } from '../services/thread.service.js'
import { ThreadServiceError } from '../services/thread.service.js'
import type { ClawService } from '../services/claw.service.js'

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ThreadPurposeEnum = z.enum(['tracking', 'debate', 'creation', 'accountability', 'coordination'])
const ThreadStatusEnum = z.enum(['active', 'completed', 'archived'])
const ContributionTypeEnum = z.enum(['text', 'pearl_ref', 'link', 'reaction'])

const CreateThreadSchema = z.object({
  purpose: ThreadPurposeEnum,
  title: z.string().min(1).max(100),
  participants: z.array(z.string()).optional(),
  encryptedKeys: z.record(z.string(), z.string()).optional(),
})

const ContributeSchema = z.object({
  encryptedContent: z.string().min(1),
  nonce: z.string().min(1),
  contentType: ContributionTypeEnum,
})

const InviteSchema = z.object({
  clawId: z.string().min(1),
  encryptedKeyForInvitee: z.string().min(1),
})

const UpdateStatusSchema = z.object({
  status: ThreadStatusEnum,
})

// ─── Error 映射 ───────────────────────────────────────────────────────────────

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof ThreadServiceError) {
    res.status(err.statusCode).json(errorResponse('THREAD_ERROR', err.message))
  } else {
    throw err
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createThreadsRouter(
  threadService: ThreadService,
  clawService: ClawService,
): Router {
  const router = Router()
  const auth = createAuthMiddleware(clawService)

  // POST /api/v1/threads — 创建 Thread
  router.post('/', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const parsed = CreateThreadSchema.parse(req.body)
      const thread = await threadService.create(clawId, {
        purpose: parsed.purpose,
        title: parsed.title,
        participants: parsed.participants,
        encryptedKeys: parsed.encryptedKeys,
      })

      // 获取参与者列表返回给客户端
      const threadWithParticipants = {
        ...thread,
        participants: [],  // TODO: 可从 repo 查询
      }
      res.status(201).json(successResponse(threadWithParticipants))
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('VALIDATION_ERROR', err.message))
      }
      handleServiceError(err, res)
      next(err)
    }
  })

  // GET /api/v1/threads — 查询我的 Thread 列表
  router.get('/', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const status = req.query['status'] as string | undefined
      const purpose = req.query['purpose'] as string | undefined
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0

      const threads = await threadService.findMyThreads(clawId, {
        status: status as 'active' | 'completed' | 'archived' | undefined,
        purpose: purpose as 'tracking' | 'debate' | 'creation' | 'accountability' | 'coordination' | undefined,
        limit,
        offset,
      })

      res.json({
        success: true,
        data: threads,
        meta: { total: threads.length, limit, offset },
      })
    } catch (err) {
      next(err)
    }
  })

  // GET /api/v1/threads/:id — 查看 Thread 详情
  router.get('/:id', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string

      const thread = await threadService.findById(threadId, clawId)
      if (!thread) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'Thread not found or not a participant'))
      }

      const [contributions, contributionCount] = await Promise.all([
        threadService.getContributions(threadId, clawId, { limit: 20 }),
        // TODO: get total count from service
        Promise.resolve(0),
      ])

      res.json(successResponse({
        thread,
        recentContributions: contributions,
        contributionCount,
      }))
    } catch (err) {
      handleServiceError(err, res)
      next(err)
    }
  })

  // POST /api/v1/threads/:id/contribute — 提交贡献（E2EE）
  router.post('/:id/contribute', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string
      const parsed = ContributeSchema.parse(req.body)

      const contribution = await threadService.contribute(
        threadId,
        clawId,
        parsed.encryptedContent,
        parsed.nonce,
        parsed.contentType,
      )

      res.status(201).json(successResponse(contribution))
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('VALIDATION_ERROR', err.message))
      }
      handleServiceError(err, res)
      next(err)
    }
  })

  // GET /api/v1/threads/:id/contributions — 获取贡献历史
  router.get('/:id/contributions', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string
      const since = req.query['since'] as string | undefined
      const limit = req.query['limit'] ? Math.min(parseInt(req.query['limit'] as string, 10), 200) : 50
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0

      const contributions = await threadService.getContributions(threadId, clawId, { since, limit })

      res.json({
        success: true,
        data: contributions,
        meta: { total: contributions.length },
      })
    } catch (err) {
      handleServiceError(err, res)
      next(err)
    }
  })

  // POST /api/v1/threads/:id/invite — 邀请好友加入
  router.post('/:id/invite', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string
      const parsed = InviteSchema.parse(req.body)

      await threadService.invite(threadId, clawId, parsed.clawId, parsed.encryptedKeyForInvitee)
      res.json(successResponse({ message: 'Invited successfully' }))
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('VALIDATION_ERROR', err.message))
      }
      handleServiceError(err, res)
      next(err)
    }
  })

  // POST /api/v1/threads/:id/digest — 请求 AI 个性化摘要
  router.post('/:id/digest', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string

      await threadService.requestDigest(threadId, clawId)
      res.status(202).json(successResponse({ message: '摘要生成中，稍后推送' }))
    } catch (err) {
      handleServiceError(err, res)
      next(err)
    }
  })

  // PATCH /api/v1/threads/:id/status — 更新 Thread 状态
  router.patch('/:id/status', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string
      const parsed = UpdateStatusSchema.parse(req.body)

      await threadService.updateStatus(threadId, clawId, parsed.status)
      const updated = await threadService.findById(threadId, clawId)
      res.json(successResponse(updated))
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('VALIDATION_ERROR', err.message))
      }
      handleServiceError(err, res)
      next(err)
    }
  })

  // GET /api/v1/threads/:id/my-key — 获取当前用户的密钥份额（E2EE）
  router.get('/:id/my-key', auth, async (req, res, next) => {
    try {
      const clawId = req.clawId as string
      const threadId = req.params['id'] as string

      const key = await threadService.getMyKey(threadId, clawId)
      if (!key) {
        return res.status(404).json(errorResponse('NOT_FOUND', 'No key found for this thread'))
      }

      res.json(successResponse(key))
    } catch (err) {
      next(err)
    }
  })

  return router
}
