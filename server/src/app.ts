import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import type Database from 'better-sqlite3'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorResponse } from '@clawbuds/shared'
import { ClawService } from './services/claw.service.js'
import { FriendshipService } from './services/friendship.service.js'
import { MessageService } from './services/message.service.js'
import { InboxService } from './services/inbox.service.js'
import { CircleService } from './services/circle.service.js'
import { ReactionService } from './services/reaction.service.js'
import { PollService } from './services/poll.service.js'
import { UploadService } from './services/upload.service.js'
import { WebhookService } from './services/webhook.service.js'
import { GroupService } from './services/group.service.js'
import { E2eeService } from './services/e2ee.service.js'
import { DiscoveryService } from './services/discovery.service.js'
import { StatsService } from './services/stats.service.js'
import { EventBus } from './services/event-bus.js'
import { createAuthRouter } from './routes/auth.js'
import { createFriendsRouter } from './routes/friends.js'
import { createMessagesRouter } from './routes/messages.js'
import { createInboxRouter } from './routes/inbox.js'
import { createCirclesRouter } from './routes/circles.js'
import { createPollsRouter } from './routes/polls.js'
import { createUploadsRouter } from './routes/uploads.js'
import { createWebhooksRouter } from './routes/webhooks.js'
import { createGroupsRouter } from './routes/groups.js'
import { createE2eeRouter } from './routes/e2ee.js'
import { createDiscoverRouter } from './routes/discover.js'
import { createProfileRouter } from './routes/profile.js'
import { config } from './config/env.js'
import { RepositoryFactory } from './db/repositories/factory.js'
import type { Request, Response, NextFunction } from 'express'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Extend Express Request to carry raw body for signature verification
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer
    }
  }
}

export interface AppContext {
  clawService?: ClawService
  inboxService?: InboxService
  eventBus?: EventBus
}

export function createApp(db?: Database.Database): { app: express.Express; ctx: AppContext } {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(
    express.json({
      limit: '100kb',
      verify: (_req, _res, buf) => {
        ;(_req as Request).rawBody = buf
      },
    }),
  )

  // Rate limiting
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxRequests,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() })
  })

  // API v1 info
  app.get('/api/v1', (_req, res) => {
    res.json({ name: 'ClawBuds API', version: '1.0' })
  })

  // Services + routes (require db)
  const ctx: AppContext = {}

  if (db) {
    // Create repository factory
    const repositoryFactory = new RepositoryFactory({
      databaseType: 'sqlite',
      sqliteDb: db,
    })

    const eventBus = new EventBus()
    const clawRepository = repositoryFactory.createClawRepository()
    const clawService = new ClawService(clawRepository)
    const friendshipRepository = repositoryFactory.createFriendshipRepository()
    const friendshipService = new FriendshipService(friendshipRepository, eventBus)
    const circleService = new CircleService(db, friendshipService)
    const reactionService = new ReactionService(db, eventBus)
    const pollService = new PollService(db, eventBus)
    const uploadDir = join(__dirname, '..', 'uploads')
    const uploadRepository = repositoryFactory.createUploadRepository()
    const uploadService = new UploadService(uploadRepository, uploadDir)
    const messageRepository = repositoryFactory.createMessageRepository()
    const messageService = new MessageService(messageRepository, friendshipService, circleService, eventBus, pollService)
    const inboxService = new InboxService(db)
    const webhookService = new WebhookService(db, eventBus)
    const groupService = new GroupService(db, eventBus)
    const e2eeService = new E2eeService(db, eventBus)
    const discoveryService = new DiscoveryService(db)
    const statsService = new StatsService(db)
    ctx.clawService = clawService
    ctx.inboxService = inboxService
    ctx.eventBus = eventBus
    app.use('/api/v1', createAuthRouter(clawService))
    app.use('/api/v1/friends', createFriendsRouter(friendshipService, clawService))
    app.use('/api/v1/messages', createMessagesRouter(messageService, clawService, reactionService))
    app.use('/api/v1/inbox', createInboxRouter(inboxService, clawService))
    app.use('/api/v1/circles', createCirclesRouter(circleService, clawService))
    app.use('/api/v1/polls', createPollsRouter(pollService, clawService))
    app.use('/api/v1/uploads', createUploadsRouter(uploadService, clawService))
    app.use('/api/v1/webhooks', createWebhooksRouter(webhookService, clawService, messageService, inboxService))
    app.use('/api/v1/groups', createGroupsRouter(groupService, clawService))
    app.use('/api/v1/e2ee', createE2eeRouter(e2eeService, clawService, groupService))
    app.use('/api/v1/discover', createDiscoverRouter(discoveryService, clawService))
    app.use('/api/v1', createProfileRouter(db, clawService, discoveryService, statsService))
  }

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err) // eslint-disable-line no-console
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    res.status(500).json(errorResponse('INTERNAL_ERROR', message))
  })

  return { app, ctx }
}
