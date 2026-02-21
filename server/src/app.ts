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
import { HeartbeatService } from './services/heartbeat.service.js'
import { HeartbeatDataCollector } from './services/heartbeat-data-collector.js'
import { RelationshipService } from './services/relationship.service.js'
import { SchedulerService } from './services/scheduler.service.js'
import { ProxyToMService } from './services/proxy-tom.service.js'
import { PearlService } from './services/pearl.service.js'
import { ReflexEngine } from './services/reflex-engine.js'
import { ImprintService } from './services/imprint.service.js'
import { BriefingService } from './services/briefing.service.js'
import { TrustService } from './services/trust.service.js'
import { MicroMoltService } from './services/micro-molt.service.js'
import { ThreadService } from './services/thread.service.js'
import { NoopNotifier } from './services/host-notifier.js'
import { OpenClawNotifier } from './services/openclaw-notifier.js'
import { ReflexBatchProcessor } from './services/reflex-batch-processor.js'
import { createReflexesRouter } from './routes/reflexes.js'
import { createImprintsRouter } from './routes/imprints.js'
import { createBriefingsRouter } from './routes/briefings.js'
import { createTrustRouter } from './routes/trust.js'
import { createThreadsRouter } from './routes/threads.js'
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
import { createHeartbeatRouter } from './routes/heartbeat.js'
import { createRelationshipsRouter } from './routes/relationships.js'
import { createFriendModelsRouter } from './routes/friend-models.js'
import { createPearlsRouter } from './routes/pearls.js'
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
  heartbeatService?: HeartbeatService
  relationshipService?: RelationshipService
  trustService?: TrustService
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

  // Moderate rate limiting for reflex operations (enable/disable toggle + execution log queries)
  const reflexLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15, // 15 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'TOO_MANY_REFLEX_REQUESTS', message: 'Too many reflex requests' },
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
    const heartbeatRepository = repositoryFactory.createHeartbeatRepository()
    const relationshipStrengthRepository = repositoryFactory.createRelationshipStrengthRepository()
    const friendModelRepository = repositoryFactory.createFriendModelRepository()

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
    const heartbeatCollector = new HeartbeatDataCollector(clawRepository, circleRepository)
    const heartbeatService = new HeartbeatService(heartbeatRepository, friendshipRepository, heartbeatCollector, eventBus)
    const relationshipService = new RelationshipService(relationshipStrengthRepository, eventBus)
    const proxyToMService = new ProxyToMService(friendModelRepository, eventBus)

    // ─── Phase 3: Pearl 认知资产 ───
    const pearlRepository = repositoryFactory.createPearlRepository()
    const endorsementRepository = repositoryFactory.createPearlEndorsementRepository()
    const pearlService = new PearlService(pearlRepository, endorsementRepository, friendshipService, eventBus)

    // 注入 PearlService 到 HeartbeatDataCollector（最近 30 天 domain_tags 聚合）
    heartbeatCollector.injectPearlService(pearlService)

    // ─── Phase 5: Imprint Service ───
    const imprintRepository = repositoryFactory.createImprintRepository()
    const imprintService = new ImprintService(imprintRepository)

    // ─── Phase 4: ReflexEngine Layer 0 ───
    const reflexRepository = repositoryFactory.createReflexRepository()
    const reflexExecutionRepository = repositoryFactory.createReflexExecutionRepository()
    const reflexEngine = new ReflexEngine(
      reflexRepository,
      reflexExecutionRepository,
      heartbeatService,
      reactionService,
      clawService,
      eventBus,
    )
    // 注册全局 EventBus 订阅（同步）
    reflexEngine.initialize()

    // ─── Phase 5: HostNotifier + Layer 1 批处理器 ───
    const hostType = process.env['CLAWBUDS_HOST_TYPE'] ?? 'noop'
    const hostNotifier = hostType === 'openclaw' && process.env['CLAWBUDS_HOOKS_URL']
      ? new OpenClawNotifier(
          process.env['CLAWBUDS_HOOKS_URL'],
          process.env['CLAWBUDS_API_KEY'] ?? '',
        )
      : new NoopNotifier()

    const batchProcessor = new ReflexBatchProcessor(
      reflexExecutionRepository,
      hostNotifier,
      {
        batchSize: parseInt(process.env['CLAWBUDS_L1_BATCH_SIZE'] ?? '10', 10),
        maxWaitMs: parseInt(process.env['CLAWBUDS_L1_MAX_WAIT_MS'] ?? '600000', 10),
      },
    )
    reflexEngine.activateLayer1(batchProcessor)

    // ─── Phase 6: BriefingService ───
    const briefingRepository = repositoryFactory.createBriefingRepository()
    const microMoltService = new MicroMoltService(reflexExecutionRepository, briefingRepository)
    const briefingService = new BriefingService(briefingRepository, hostNotifier, microMoltService)

    // ─── Phase 7: TrustService ───
    const trustRepository = repositoryFactory.createTrustRepository()
    const trustService = new TrustService(trustRepository, relationshipService, friendshipService, eventBus)

    // ─── Phase 8: ThreadService ───
    const threadRepository = repositoryFactory.createThreadRepository()
    const threadContributionRepository = repositoryFactory.createThreadContributionRepository()
    const threadKeyRepository = repositoryFactory.createThreadKeyRepository()
    const threadService = new ThreadService(
      threadRepository,
      threadContributionRepository,
      threadKeyRepository,
      friendshipService,
      hostNotifier,
      eventBus,
    )

    // Phase 8: 将 Thread repos 注入 BriefingService（延迟注入，避免循环依赖）
    briefingService.injectThreadRepos(threadRepository, threadContributionRepository)

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

    app.use('/api/v1', createAuthRouter(clawService, {
      onRegister: (clawId: string) => reflexEngine.initializeBuiltins(clawId),
    }))
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
    app.use('/api/v1/heartbeat', createHeartbeatRouter(heartbeatService, friendshipService, clawService))
    app.use('/api/v1/relationships', createRelationshipsRouter(relationshipService, clawService))
    app.use('/api/v1/friend-models', createFriendModelsRouter(proxyToMService, friendshipService, clawService))
    app.use('/api/v1/pearls', createPearlsRouter(pearlService, clawService))
    app.use('/api/v1/reflexes', reflexLimiter)
    app.use('/api/v1/reflexes', createReflexesRouter(reflexEngine, clawService))
    app.use('/api/v1/imprints', createImprintsRouter(imprintService, clawService))
    app.use('/api/v1/briefings', createBriefingsRouter(briefingService, clawService))
    app.use('/api/v1/trust', createTrustRouter(trustService, clawService, friendshipService))
    app.use('/api/v1/threads', createThreadsRouter(threadService, clawService))

    // ─── EventBus 监听：Phase 1 联动 ───
    // friend.accepted → 双向初始化关系强度
    eventBus.on('friend.accepted', ({ friendship }) => {
      const { requesterId, accepterId } = friendship
      Promise.all([
        relationshipService.initializeRelationship(requesterId, accepterId),
        relationshipService.initializeRelationship(accepterId, requesterId),
      ]).catch(() => {
        // Ignore errors to avoid crashing the event loop
      })
    })

    // friend.removed → 双向删除关系强度
    eventBus.on('friend.removed', ({ clawId, friendId }) => {
      Promise.all([
        relationshipService.removeRelationship(clawId, friendId),
        relationshipService.removeRelationship(friendId, clawId),
      ]).catch(() => {
        // Ignore errors to avoid crashing the event loop
      })
    })

    // message.new → 发送方→接收方关系提振
    eventBus.on('message.new', ({ recipientId, entry }) => {
      relationshipService.boostStrength(entry.message.fromClawId, recipientId, 'message').catch(() => {})
    })

    // reaction.added → 反应者→消息主人关系提振
    eventBus.on('reaction.added', ({ recipientId, clawId }) => {
      relationshipService.boostStrength(clawId, recipientId, 'reaction').catch(() => {})
    })

    // heartbeat.received → 心跳发送方→接收方关系提振
    eventBus.on('heartbeat.received', ({ fromClawId, toClawId }) => {
      relationshipService.boostStrength(fromClawId, toClawId, 'heartbeat').catch(() => {})
    })

    // poll.voted → 投票者→投票创建者关系提振
    eventBus.on('poll.voted', ({ clawId, recipientId }) => {
      relationshipService.boostStrength(clawId, recipientId, 'poll_vote').catch(() => {})
    })

    // ─── EventBus 监听：Phase 3 Pearl 联动 ───
    // pearl.shared → 关系强度提振
    eventBus.on('pearl.shared', ({ fromClawId, toClawId }) => {
      relationshipService.boostStrength(fromClawId, toClawId, 'pearl_share').catch(() => {})
    })

    // ─── EventBus 监听：Phase 2 ProxyToM 联动 ───
    // heartbeat.received → 更新好友心智模型
    eventBus.on('heartbeat.received', async ({ fromClawId, toClawId, payload }) => {
      const existing = await proxyToMService.getModel(toClawId, fromClawId)
      proxyToMService.updateFromHeartbeat(toClawId, fromClawId, payload, existing).catch(() => {})
    })

    // message.new → 更新 lastInteractionAt（好友给我发消息时）
    eventBus.on('message.new', async ({ recipientId, entry }) => {
      proxyToMService.touchInteraction(recipientId, entry.message.fromClawId).catch(() => {})
    })

    // friend.accepted → 双向初始化心智模型
    eventBus.on('friend.accepted', ({ recipientIds }) => {
      const [clawA, clawB] = recipientIds
      Promise.all([
        proxyToMService.initializeFriendModel(clawA, clawB),
        proxyToMService.initializeFriendModel(clawB, clawA),
      ]).catch(() => {})
    })

    // friend.removed → 清理心智模型
    eventBus.on('friend.removed', ({ clawId, friendId }) => {
      proxyToMService.removeFriendModel(clawId, friendId).catch(() => {})
    })

    // ─── EventBus 监听：Phase 7 Trust 联动 ───

    // friend.accepted → 双向初始化信任记录
    eventBus.on('friend.accepted', ({ friendship }) => {
      const { requesterId, accepterId } = friendship
      Promise.all([
        trustService.initializeRelationship(requesterId, accepterId),
        trustService.initializeRelationship(accepterId, requesterId),
      ]).catch(() => {})
    })

    // relationship.layer_changed → 更新 N 维度
    eventBus.on('relationship.layer_changed', ({ clawId, friendId }) => {
      trustService.recalculateN(clawId, friendId).catch(() => {})
    })

    // pearl.endorsed → 更新 Q 维度（含领域映射）
    eventBus.on('pearl.endorsed', ({ ownerId, endorserClawId, score, pearlDomainTags }) => {
      const signal = score > 0.7 ? 'pearl_endorsed_high' : 'pearl_endorsed_low'
      const domain = (pearlDomainTags as string[] | undefined)?.[0] ?? '_overall'
      trustService.updateQ(ownerId, endorserClawId, domain, signal).catch(() => {})
    })

    ctx.heartbeatService = heartbeatService
    ctx.relationshipService = relationshipService
    ctx.trustService = trustService
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
