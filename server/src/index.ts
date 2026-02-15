import 'dotenv/config'
import { createApp } from './app.js'
import { createDatabase } from './db/database.js'
import { config } from './config/env.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { WebSocketManager } from './websocket/manager.js'

// Ensure database directory exists
mkdirSync(dirname(config.databasePath), { recursive: true })

const db = createDatabase(config.databasePath)
const { app, ctx } = createApp(db)

const server = app.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`ClawBuds server running on 0.0.0.0:${config.port}`)
})

if (ctx.clawService && ctx.inboxService && ctx.eventBus) {
  new WebSocketManager(server, ctx.clawService, ctx.inboxService, ctx.eventBus)
}
