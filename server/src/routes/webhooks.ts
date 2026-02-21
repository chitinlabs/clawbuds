import { Router } from 'express'
import { z } from 'zod'
import { successResponse, errorResponse } from '../lib/response.js'
import { WebhookService, WebhookError, toPublicWebhookProfile } from '../services/webhook.service.js'
import { createAuthMiddleware } from '../middleware/auth.js'
import type { ClawService } from '../services/claw.service.js'
import type { InboxService } from '../services/inbox.service.js'
import type { MessageService } from '../services/message.service.js'
import { asyncHandler } from '../lib/async-handler.js'

const CreateWebhookSchema = z.object({
  type: z.enum(['outgoing', 'incoming']),
  name: z.string().min(1).max(100),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
})

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
})

const IncomingWebhookSchema = z.object({
  text: z.string().min(1).max(10000),
  visibility: z.enum(['public', 'direct']).default('direct'),
  toClawIds: z.array(z.string()).optional(),
})

export function createWebhooksRouter(
  webhookService: WebhookService,
  clawService: ClawService,
  messageService?: MessageService,
  inboxService?: InboxService,
): Router {
  const router = Router()
  const requireAuth = createAuthMiddleware(clawService)

  // POST /api/v1/webhooks - Create webhook
  router.post('/', requireAuth, async (req, res) => {
    const parsed = CreateWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const webhook = await webhookService.create({
        clawId: req.clawId!,
        ...parsed.data,
      })
      res.status(201).json(successResponse(webhook))
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusMap: Record<string, number> = {
          MISSING_URL: 400,
          DUPLICATE_NAME: 409,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/webhooks - List my webhooks (secrets redacted)
  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const webhooks = await webhookService.listByClawId(req.clawId!)
    res.json(successResponse(webhooks.map(toPublicWebhookProfile)))
  }))

  // GET /api/v1/webhooks/:id - Get webhook details (secret redacted)
  router.get('/:id', requireAuth, async (req, res) => {
    const webhook = await webhookService.findById(req.params.id as string)
    if (!webhook) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Webhook not found'))
      return
    }
    if (webhook.clawId !== req.clawId!) {
      res.status(403).json(errorResponse('FORBIDDEN', 'Not your webhook'))
      return
    }
    res.json(successResponse(toPublicWebhookProfile(webhook)))
  })

  // PATCH /api/v1/webhooks/:id - Update webhook
  router.patch('/:id', requireAuth, async (req, res) => {
    const parsed = UpdateWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    try {
      const webhook = await webhookService.update(req.params.id as string, req.clawId!, parsed.data)
      res.json(successResponse(toPublicWebhookProfile(webhook)))
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          FORBIDDEN: 403,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // DELETE /api/v1/webhooks/:id - Delete webhook
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      await webhookService.delete(req.params.id as string, req.clawId!)
      res.json(successResponse({ deleted: true }))
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          FORBIDDEN: 403,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // GET /api/v1/webhooks/:id/deliveries - Get delivery log
  router.get('/:id/deliveries', requireAuth, async (req, res) => {
    const rawLimit = parseInt(req.query.limit as string || '20', 10)
    const limit = Math.min(isNaN(rawLimit) ? 20 : Math.max(1, rawLimit), 100)

    try {
      const deliveries = await webhookService.getDeliveries(req.params.id as string, req.clawId!, limit)
      res.json(successResponse(deliveries))
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          FORBIDDEN: 403,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/webhooks/:id/test - Send test event
  router.post('/:id/test', requireAuth, async (req, res) => {
    try {
      const delivery = await webhookService.sendTestEvent(req.params.id as string, req.clawId!)
      res.json(successResponse(delivery))
    } catch (err) {
      if (err instanceof WebhookError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          INVALID_TYPE: 400,
          MISSING_URL: 400,
        }
        res
          .status(statusMap[err.code] || 400)
          .json(errorResponse(err.code, err.message))
        return
      }
      throw err
    }
  })

  // POST /api/v1/webhooks/incoming/:id - Incoming webhook endpoint (no auth, uses HMAC)
  router.post('/incoming/:id', async (req, res) => {
    const webhook = await webhookService.findById(req.params.id as string)
    if (!webhook) {
      res.status(404).json(errorResponse('NOT_FOUND', 'Webhook not found'))
      return
    }
    if (webhook.type !== 'incoming') {
      res.status(400).json(errorResponse('INVALID_TYPE', 'Not an incoming webhook'))
      return
    }
    if (!webhook.active) {
      res.status(400).json(errorResponse('WEBHOOK_DISABLED', 'Webhook is disabled'))
      return
    }

    // Verify HMAC signature
    const signature = req.headers['x-clawbuds-signature'] as string | undefined
    if (!signature) {
      res.status(401).json(errorResponse('MISSING_SIGNATURE', 'Missing X-ClawBuds-Signature header'))
      return
    }

    const rawBody = req.rawBody?.toString('utf-8') || JSON.stringify(req.body)
    if (!webhookService.verifySignature(webhook.secret, rawBody, signature)) {
      res.status(401).json(errorResponse('INVALID_SIGNATURE', 'Signature verification failed'))
      return
    }

    // Validate payload
    const parsed = IncomingWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(errorResponse('VALIDATION_ERROR', 'Invalid request body', parsed.error.errors))
      return
    }

    // Create message if messageService is available
    if (!messageService) {
      res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'Message service not configured'))
      return
    }

    try {
      // Create message blocks from text
      const blocks = [{ type: 'text' as const, text: parsed.data.text }]

      // Determine visibility and recipients
      // If no toClawIds specified, use public visibility to send to all friends
      // If toClawIds specified, use the specified visibility (default: direct)
      let visibility = parsed.data.visibility
      let toClawIds = parsed.data.toClawIds

      if (!toClawIds || toClawIds.length === 0) {
        // No specific recipients: send as public message to all friends
        visibility = 'public'
        toClawIds = undefined
      } else {
        // Filter out self from recipients (can't send to yourself)
        toClawIds = toClawIds.filter((id) => id !== webhook.clawId)

        if (toClawIds.length === 0) {
          res.status(400).json(errorResponse('INVALID_RECIPIENTS', 'Cannot send message to yourself'))
          return
        }
      }

      // Send message
      const result = await messageService.sendMessage(webhook.clawId, {
        blocks,
        visibility,
        toClawIds,
      })

      res.json(successResponse({
        received: true,
        webhookId: webhook.id,
        clawId: webhook.clawId,
        messageId: result.message.id,
        recipientCount: result.recipientCount,
      }))
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        const statusMap: Record<string, number> = {
          MISSING_RECIPIENTS: 400,
          NOT_FRIENDS: 403,
          INVALID_RECIPIENT: 400,
        }
        res
          .status(statusMap[(err as { code: string }).code] || 500)
          .json(errorResponse((err as { code: string }).code, err.message))
        return
      }
      throw err
    }
  })

  return router
}
