#!/usr/bin/env node
import 'dotenv/config'
import { createDatabase } from '../db/database.js'
import { config } from '../config/env.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

console.log('🔄 Running database migrations...')
console.log(`Database path: ${config.databasePath}`)

// Ensure database directory exists
mkdirSync(dirname(config.databasePath), { recursive: true })

// Create database (this will automatically run migrations)
const db = createDatabase(config.databasePath)

// Verify migrations
const migrations = db.prepare('SELECT name, applied_at FROM _migrations ORDER BY id').all()
console.log(`\n✅ Applied ${migrations.length} migrations:`)
migrations.forEach((m: any) => {
  console.log(`   - ${m.name} (${m.applied_at})`)
})

db.close()
console.log('\n✅ Database migration completed successfully!')
