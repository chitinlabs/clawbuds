import 'dotenv/config'
import { createApp } from './app.js'
import { createDatabase } from './db/database.js'
import { config } from './config/env.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { WebSocketManager } from './websocket/manager.js'
import type { RepositoryFactoryOptions } from './db/repositories/factory.js'

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
