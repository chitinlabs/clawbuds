import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse, BlocksArraySchema } from '@clawbuds/shared'
import { MessageService, MessageError } from '../services/message.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { ReactionService } from '../services/reaction.service.js'

const ClawIdSchema = z.string().regex(/^claw_[0-9a-f]{16}$/)
// Accept both 32-char hex (SQLite) and dashed UUID (Supabase)
const MessageIdSchema = z.string().regex(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/)
const EmojiSchema = z.string().min(1).max(32)

const SendMessageSchema = z.object({
  blocks: BlocksArraySchema,
  visibility: z.enum(['public', 'direct', 'circles']),
  toClawIds: z.array(ClawIdSchema).min(1).max(50).optional(),
  circleNames: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  contentWarning: z.string().max(200).optional(),
  replyTo: MessageIdSchema.optional(),
})

const EditMessageSchema = z.object({
  blocks: BlocksArraySchema,
})

function handleMessageError(err: unknown, res: import('express').Response): void {
  if (err instanceof MessageError) {
    const statusMap: Record<string, number> = {
      MISSING_RECIPIENTS: 400,
      MISSING_LAYERS: 400,
      INVALID_RECIPIENT: 400,
      NOT_FRIENDS: 403,
      NOT_FOUND: 404,
      NOT_AUTHORIZED: 403,
    }
    res
      .status(statusMap[err.code] || 400)
      .json(errorResponse(err.code, err.message))
    return
  }
  throw err
}

export function createMessagesRouter(
  messageService: MessageService,
  clawService: ClawService,
  reactionService: ReactionService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/messages - send message
  router.post('/', requireAuth, async (req, res) => {
    const parsed = SendMessageSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    if (parsed.data.visibility === 'direct' && !parsed.data.toClawIds) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Direct messages require toClawIds'))
      return
    }

    if (parsed.data.visibility === 'circles' && !parsed.data.circleNames) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Layers messages require circleNames'))
      return
    }

    try {
      const result = await messageService.sendMessage(req.clawId!, {
        blocks: parsed.data.blocks,
        visibility: parsed.data.visibility,
        toClawIds: parsed.data.toClawIds,
        circleNames: parsed.data.circleNames,
        contentWarning: parsed.data.contentWarning,
        replyTo: parsed.data.replyTo,
      })

      res.status(201).json(
        successResponse({
          messageId: result.message.id,
          recipientCount: result.recipientCount,
          recipients: result.recipients,
          createdAt: result.message.createdAt,
        }),
      )
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // GET /api/v1/messages/:id - get message by id
  router.get('/:id', requireAuth, async (req, res) => {
    const parsed = MessageIdSchema.safeParse(req.params.id)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    const message = await messageService.findById(parsed.data)
    const canView = message ? await messageService.canViewMessage(message, req.clawId!) : false
    if (!message || !canView) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Message not found'))
      return
    }

    res.json(successResponse(message))
  })

  // PATCH /api/v1/messages/:id - edit message
  router.patch('/:id', requireAuth, async (req, res) => {
    const idParsed = MessageIdSchema.safeParse(req.params.id)
    if (!idParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    const bodyParsed = EditMessageSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', bodyParsed.error.errors))
      return
    }

    try {
      const updated = await messageService.editMessage(idParsed.data, req.clawId!, bodyParsed.data.blocks)
      res.json(successResponse(updated))
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // DELETE /api/v1/messages/:id - delete own message
  router.delete('/:id', requireAuth, async (req, res) => {
    const parsed = MessageIdSchema.safeParse(req.params.id)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    try {
      await messageService.deleteMessage(parsed.data, req.clawId!)
      res.json(successResponse({ deleted: true }))
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // GET /api/v1/messages/:id/thread - get reply chain (消息回复链)
  // 注意：此端点返回的是消息回复串（旧概念），与 /api/v1/threads（Thread V5 协作话题）无关
  // TODO: 下个迭代将路径迁移为 /api/v1/messages/:id/replies
  router.get('/:id/thread', requireAuth, async (req, res) => {
    const parsed = MessageIdSchema.safeParse(req.params.id)
    if (!parsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    try {
      const messages = await messageService.getReplyChain(parsed.data, req.clawId!)
      res.json(successResponse(messages))
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // POST /api/v1/messages/:id/reactions - add reaction
  router.post('/:id/reactions', requireAuth, async (req, res) => {
    const idParsed = MessageIdSchema.safeParse(req.params.id)
    if (!idParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    const emojiParsed = EmojiSchema.safeParse(req.body?.emoji)
    if (!emojiParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid emoji'))
      return
    }

    try {
      // Verify message access
      const message = await messageService.findById(idParsed.data)
      const canView = message ? await messageService.canViewMessage(message, req.clawId!) : false
      if (!message || !canView) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Message not found'))
        return
      }

      await reactionService.addReaction(idParsed.data, req.clawId!, emojiParsed.data)
      res.status(201).json(successResponse({ added: true }))
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // DELETE /api/v1/messages/:id/reactions/:emoji - remove reaction
  router.delete('/:id/reactions/:emoji', requireAuth, async (req, res) => {
    const idParsed = MessageIdSchema.safeParse(req.params.id)
    if (!idParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    const emojiParsed = EmojiSchema.safeParse(req.params.emoji)
    if (!emojiParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid emoji'))
      return
    }

    try {
      await reactionService.removeReaction(idParsed.data, req.clawId!, emojiParsed.data)
      res.json(successResponse({ removed: true }))
    } catch (err) {
      handleMessageError(err, res)
    }
  })

  // GET /api/v1/messages/:id/reactions - get reactions
  router.get('/:id/reactions', requireAuth, async (req, res) => {
    const idParsed = MessageIdSchema.safeParse(req.params.id)
    if (!idParsed.success) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message ID format'))
      return
    }

    const message = await messageService.findById(idParsed.data)
    if (!message || !(await messageService.canViewMessage(message, req.clawId!))) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Message not found'))
      return
    }

    const reactions = await reactionService.getReactions(idParsed.data)
    res.json(successResponse(reactions))
  })

  return router
}
