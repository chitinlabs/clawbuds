import 'dotenv/config'
import { createApp } from './app.js'
import { createDatabase } from './db/database.js'
import { config } from './config/env.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { WebSocketManager } from './websocket/manager.js'
import type { RepositoryFactoryOptions } from './db/repositories/factory.js'
import { SchedulerService } from './services/scheduler.service.js'

// Interval constants (configurable via env)
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.CLAWBUDS_HEARTBEAT_INTERVAL_MS ?? String(5 * 60 * 1000), 10) // 5 min (PRD §4.1)
const DECAY_INTERVAL_MS = parseInt(process.env.CLAWBUDS_DECAY_INTERVAL_MS ?? String(24 * 60 * 60 * 1000), 10)   // 24 h
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLAWBUDS_CLEANUP_INTERVAL_MS ?? String(24 * 60 * 60 * 1000), 10) // 24 h
const TRUST_DECAY_INTERVAL_MS = parseInt(process.env.CLAWBUDS_TRUST_DECAY_INTERVAL_MS ?? String(30 * 24 * 60 * 60 * 1000), 10) // 30 days (Phase 7)

async function buildRepositoryOptions(): Promise<RepositoryFactoryOptions> {
  if (config.databaseType === 'supabase') {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_TYPE=supabase')
    }
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey)
    return {
      databaseType: 'supabase',
      supabaseClient,
    }
  }

  // Default: SQLite
  mkdirSync(dirname(config.databasePath), { recursive: true })
  const db = createDatabase(config.databasePath)
  return {
    databaseType: 'sqlite',
    sqliteDb: db,
  }
}

// Validate CORS configuration in production
if (config.nodeEnv === 'production' && (!config.corsOrigin || config.corsOrigin === '*')) {
  throw new Error('CORS_ORIGIN must be set to a specific origin in production (not * or empty)')
}

const repositoryOptions = await buildRepositoryOptions()
const { app, ctx } = createApp({ repositoryOptions })

const server = app.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`ClawBuds server running on 0.0.0.0:${config.port} [${config.databaseType}]`)
})

if (ctx.clawService && ctx.inboxService && ctx.eventBus) {
  new WebSocketManager(server, ctx.clawService, ctx.inboxService, ctx.eventBus, ctx.realtimeService)
}

// ─── Phase 1 定时任务 ───
if (ctx.heartbeatService && ctx.relationshipService) {
  const scheduler = new SchedulerService({
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    decayIntervalMs: DECAY_INTERVAL_MS,
    cleanupIntervalMs: CLEANUP_INTERVAL_MS,
    onHeartbeat: async () => {
      // NOTE: sendHeartbeats requires a specific clawId; in Phase 1 this is a no-op
      // as heartbeats are triggered per-user. Future: iterate all active claws.
    },
    onDecay: async () => {
      await ctx.relationshipService!.decayAll()
    },
    onCleanup: async () => {
      await ctx.heartbeatService!.cleanup()
    },
  })
  scheduler.start()
  // eslint-disable-next-line no-console
  console.log('[scheduler] started: heartbeat, decay, cleanup timers registered')
}

// ─── Phase 7: 月度信任衰减 ───
if (ctx.trustService) {
  setInterval(() => {
    ctx.trustService!.decayAll().catch(() => {})
  }, TRUST_DECAY_INTERVAL_MS)
  // eslint-disable-next-line no-console
  console.log('[scheduler] trust monthly decay registered')
}
