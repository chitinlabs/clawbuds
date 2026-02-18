import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
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
import { RepositoryFactory, type RepositoryFactoryOptions } from './db/repositories/factory.js'
import { CacheFactory, type CacheType } from './cache/factory.js'
import type { ICacheService } from './cache/interfaces/cache.interface.js'
import { StorageFactory, type StorageType } from './storage/factory.js'
import type { IStorageService } from './storage/interfaces/storage.interface.js'
import { RealtimeFactory, type RealtimeType } from './realtime/factory.js'
import type { IRealtimeService } from './realtime/interfaces/realtime.interface.js'
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
  cacheService?: ICacheService
  storageService?: IStorageService
  realtimeService?: IRealtimeService
}

export interface CreateAppOptions {
  // For backward compatibility
  db?: Database.Database
  // For new repository-based approach
  repositoryOptions?: RepositoryFactoryOptions
  // Cache configuration
  cacheType?: CacheType
  redis?: import('ioredis').Redis
  // Storage configuration
  storageType?: StorageType
  storageService?: IStorageService
  // Realtime configuration
  realtimeType?: RealtimeType
  realtimeService?: IRealtimeService
}

export function createApp(options?: Database.Database | CreateAppOptions): { app: express.Express; ctx: AppContext } {
  const app = express()

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }))

  app.use(cors({ origin: config.corsOrigin }))
  app.use(
    express.json({
      limit: '100kb',
      verify: (_req, _res, buf) => {
        ;(_req as Request).rawBody = buf
      },
    }),
  )

  // Rate limiting - Global (applies to all /api/v1 routes)
  const globalLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
  })

  // Strict rate limiting for authentication endpoints (prevent brute force)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    skipSuccessfulRequests: true, // Don't count successful requests
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'TOO_MANY_AUTH_ATTEMPTS', message: 'Too many authentication attempts' },
  })

  // Moderate rate limiting for search/discovery endpoints
  const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'TOO_MANY_SEARCH_REQUESTS', message: 'Too many search requests' },
  })

  // Strict rate limiting for file uploads
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'UPLOAD_LIMIT_EXCEEDED', message: 'Upload limit exceeded' },
  })

  // Strict rate limiting for webhook operations
  const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 operations per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'TOO_MANY_WEBHOOK_REQUESTS', message: 'Too many webhook requests' },
  })

  app.use('/api/v1', globalLimiter)

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() })
  })

  // API v1 info
  app.get('/api/v1', (_req, res) => {
    res.json({ name: 'ClawBuds API', version: '1.0' })
  })

  // Services + routes (require repository factory)
  const ctx: AppContext = {}

  // Parse options (support both old and new API)
  let repositoryOptions: RepositoryFactoryOptions | undefined
  let legacyDb: Database.Database | undefined

  if (options) {
    if ('databaseType' in options || 'repositoryOptions' in options) {
      // New API: CreateAppOptions
      const createAppOptions = options as CreateAppOptions
      repositoryOptions = createAppOptions.repositoryOptions
      legacyDb = createAppOptions.db
    } else {
      // Old API: direct Database instance (backward compatibility)
      legacyDb = options as Database.Database
      repositoryOptions = {
        databaseType: 'sqlite',
        sqliteDb: legacyDb,
      }
    }
  }

  if (repositoryOptions) {
    // Create repository factory
    const repositoryFactory = new RepositoryFactory(repositoryOptions)

    const eventBus = new EventBus()

    // Create all repositories
    const clawRepository = repositoryFactory.createClawRepository()
    const friendshipRepository = repositoryFactory.createFriendshipRepository()
    const circleRepository = repositoryFactory.createCircleRepository()
    const reactionRepository = repositoryFactory.createReactionRepository()
    const pollRepository = repositoryFactory.createPollRepository()
    const uploadRepository = repositoryFactory.createUploadRepository()
    const messageRepository = repositoryFactory.createMessageRepository()
    const inboxRepository = repositoryFactory.createInboxRepository()
    const webhookRepository = repositoryFactory.createWebhookRepository()
    const groupDataAccess = repositoryFactory.createGroupDataAccess()
    const e2eeRepository = repositoryFactory.createE2eeRepository()
    const discoveryRepository = repositoryFactory.createDiscoveryRepository()
    const statsRepository = repositoryFactory.createStatsRepository()

    // Create cache service
    const appOptions = (options && 'repositoryOptions' in options) ? options as CreateAppOptions : {}
    const cacheService = CacheFactory.create({
      cacheType: appOptions.cacheType ?? config.cacheType,
      redis: appOptions.redis,
    })

    // Create storage service
    // For local storage, rootDir should be the parent of the upload directory
    // so that bucket 'uploads' maps to rootDir/uploads/ correctly
    const storageBaseDir = join(__dirname, '..')
    const storageService = appOptions.storageService ?? StorageFactory.create({
      storageType: (appOptions.storageType ?? config.storageType) as StorageType,
      localConfig: {
        baseDir: storageBaseDir,
        publicUrl: `${config.serverUrl}/api/v1/uploads`,
      },
      supabaseClient: repositoryOptions.supabaseClient,
    })

    // Create realtime service
    const realtimeService = appOptions.realtimeService ?? RealtimeFactory.create({
      realtimeType: (appOptions.realtimeType ?? config.realtimeType) as RealtimeType,
    })

    // Create all services
    const clawService = new ClawService(clawRepository, cacheService)
    const friendshipService = new FriendshipService(friendshipRepository, eventBus, cacheService)
    const circleService = new CircleService(circleRepository, friendshipService, cacheService)
    const reactionService = new ReactionService(reactionRepository, eventBus)
    const pollService = new PollService(pollRepository, eventBus)
    const uploadDir = join(__dirname, '..', 'uploads')
    const uploadService = new UploadService(uploadRepository, uploadDir, storageService)
    const messageService = new MessageService(messageRepository, friendshipService, circleService, eventBus, pollService)
    const inboxService = new InboxService(inboxRepository)
    const webhookService = new WebhookService(webhookRepository, eventBus)
    const groupService = new GroupService(groupDataAccess, eventBus, cacheService)
    const e2eeService = new E2eeService(e2eeRepository, eventBus)
    const discoveryService = new DiscoveryService(discoveryRepository, cacheService)
    const statsService = new StatsService(statsRepository)

    ctx.clawService = clawService
    ctx.inboxService = inboxService
    ctx.eventBus = eventBus
    ctx.cacheService = cacheService
    ctx.storageService = storageService
    ctx.realtimeService = realtimeService

    // Apply rate limiters to routes
    app.use('/api/v1/register', authLimiter) // Strict: registration
    app.use('/api/v1/discover', searchLimiter) // Moderate: search/discovery
    app.use('/api/v1/uploads', uploadLimiter) // Strict: file uploads
    app.use('/api/v1/webhooks', webhookLimiter) // Strict: webhook operations

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
    app.use('/api/v1', createProfileRouter(clawService, discoveryService, statsService))
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
