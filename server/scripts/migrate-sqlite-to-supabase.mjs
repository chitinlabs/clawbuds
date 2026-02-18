/**
 * Migrate SQLite Data to Supabase
 *
 * Migrates all data from SQLite database to Supabase PostgreSQL
 */

import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH ||
  '/home/wyh/apps/clawbuds/server/data/clawbuds.db'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required')
  process.exit(1)
}

console.log('🚀 SQLite to Supabase Data Migration')
console.log('=====================================')
console.log(`SQLite DB: ${SQLITE_DB_PATH}`)
console.log(`Supabase URL: ${SUPABASE_URL}`)
console.log('')

// Table migration order (respects foreign key dependencies)
const TABLES = [
  // Core tables first
  'claws',
  'seq_counters',
  'claw_stats',
  'e2ee_keys',

  // Relationships
  'friendships',

  // Messages and related
  'messages',
  'message_recipients',
  'inbox_entries',
  'reactions',
  'polls',
  'poll_votes',

  // Groups
  'groups',
  'group_members',
  'group_invitations',
  'group_sender_keys',
  'group_messages',

  // Circles
  'circles',
  'friend_circles',

  // Uploads
  'uploads',

  // Webhooks
  'webhooks',
  'webhook_deliveries',

  // Push
  'push_subscriptions',
]

// Helper: Convert claw_xxx format to UUID
function clawIdToUUID(clawId) {
  if (!clawId || typeof clawId !== 'string') return clawId

  // claw_ffe054fe7ae0cb6d → UUID format
  // Extract the hex part: ffe054fe7ae0cb6d (16 chars = 64 bits)
  // Need to pad to 128 bits for UUID
  const match = clawId.match(/^claw_([0-9a-f]{16})$/)
  if (!match) return clawId

  const hex = match[1]
  // Create UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // Use the 16 hex chars and pad with zeros
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-a${hex.slice(15, 16)}00-000000000000`
  return uuid
}

// Helper: Convert any ID field that looks like claw_xxx or uses hex
function convertIdField(key, value) {
  if (value === null || typeof value !== 'string') return value

  // Convert claw_xxx IDs
  if (value.startsWith('claw_')) {
    return clawIdToUUID(value)
  }

  // If it's an ID field but not in UUID format, try to convert
  if ((key === 'id' || key.endsWith('_id')) && value.length < 36) {
    // Pad short hex strings to UUID format
    const cleaned = value.replace(/[^0-9a-f]/gi, '')
    if (cleaned.length === 32) {
      // Full 128-bit hex, convert to UUID format
      return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`
    } else if (cleaned.length === 16) {
      // 64-bit hex, pad to UUID
      return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-4${cleaned.slice(12, 15)}-a${cleaned.slice(15, 16)}00-000000000000`
    }
  }

  return value
}

async function migrateTable(db, supabase, tableName) {
  console.log(`\n📦 Migrating table: ${tableName}`)

  try {
    // Get all rows from SQLite
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all()

    if (rows.length === 0) {
      console.log(`   ⚠️  No data to migrate (empty table)`)
      return { success: true, count: 0 }
    }

    console.log(`   Found ${rows.length} rows`)

    // Convert SQLite data to Supabase format
    const convertedRows = rows.map(row => {
      const converted = {}

      for (const [key, value] of Object.entries(row)) {
        // Convert column names: snake_case is fine for Supabase
        // Convert data types
        if (value === null) {
          converted[key] = null
        } else if (key === 'id' || key.endsWith('_id') || key === 'claw_id') {
          // Convert ID fields
          converted[key] = convertIdField(key, value)
        } else if (typeof value === 'string' && (key.includes('json') || key === 'tags' || key === 'capabilities' || key === 'events')) {
          // Parse JSON strings
          try {
            converted[key] = JSON.parse(value)
          } catch {
            converted[key] = value
          }
        } else if (typeof value === 'number' && (key.includes('_at') || key === 'created_at' || key === 'updated_at')) {
          // Convert Unix timestamps to ISO strings
          // SQLite stores as milliseconds, PostgreSQL expects ISO string
          converted[key] = new Date(value).toISOString()
        } else {
          converted[key] = value
        }
      }

      return converted
    })

    // Insert in batches (Supabase has a limit)
    const BATCH_SIZE = 100
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < convertedRows.length; i += BATCH_SIZE) {
      const batch = convertedRows.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(convertedRows.length / BATCH_SIZE)

      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} rows)... `)

      try {
        const { data, error } = await supabase
          .from(tableName)
          .insert(batch)

        if (error) {
          console.log(`❌ ${error.message}`)
          console.log(`   Error details:`, error)
          errorCount += batch.length
        } else {
          console.log(`✅`)
          successCount += batch.length
        }
      } catch (err) {
        console.log(`❌ ${err.message}`)
        errorCount += batch.length
      }
    }

    console.log(`   ✅ Success: ${successCount}, ❌ Errors: ${errorCount}`)

    return {
      success: errorCount === 0,
      count: successCount,
      errors: errorCount
    }

  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`)
    return {
      success: false,
      count: 0,
      errors: 1,
      error: err.message
    }
  }
}

async function migrate() {
  let sqliteDb
  let supabase

  try {
    // Connect to SQLite
    console.log('📂 Opening SQLite database...')
    sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true })
    console.log('✅ SQLite connected')

    // Connect to Supabase
    console.log('\n🔗 Connecting to Supabase...')
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    console.log('✅ Supabase connected')

    // Get table counts
    console.log('\n📊 Source data summary:')
    const summary = {}
    for (const table of TABLES) {
      try {
        const count = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()
        summary[table] = count.count
        console.log(`   ${table}: ${count.count} rows`)
      } catch (err) {
        console.log(`   ${table}: ⚠️  ${err.message}`)
      }
    }

    // Confirm migration
    const totalRows = Object.values(summary).reduce((a, b) => a + b, 0)
    console.log(`\n📈 Total rows to migrate: ${totalRows}`)
    console.log('\n⏳ Starting migration...')

    // Migrate each table
    const results = {}
    for (const table of TABLES) {
      if (summary[table] > 0) {
        results[table] = await migrateTable(sqliteDb, supabase, table)
      } else {
        console.log(`\n📦 Skipping table: ${table} (empty)`)
        results[table] = { success: true, count: 0, skipped: true }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('📊 Migration Summary')
    console.log('='.repeat(50))

    let totalSuccess = 0
    let totalErrors = 0
    let totalSkipped = 0

    for (const [table, result] of Object.entries(results)) {
      if (result.skipped) {
        console.log(`${table}: Skipped (empty)`)
        totalSkipped++
      } else if (result.success) {
        console.log(`${table}: ✅ ${result.count} rows migrated`)
        totalSuccess += result.count
      } else {
        console.log(`${table}: ❌ ${result.errors || 0} errors`)
        totalErrors += result.errors || 0
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log(`Total migrated: ${totalSuccess} rows`)
    console.log(`Total errors: ${totalErrors} rows`)
    console.log(`Total skipped: ${totalSkipped} tables`)
    console.log('='.repeat(50))

    if (totalErrors === 0) {
      console.log('\n🎉 Migration completed successfully!')
    } else {
      console.log('\n⚠️  Migration completed with errors')
      process.exit(1)
    }

  } catch (err) {
    console.error('\n❌ Fatal error:', err)
    process.exit(1)
  } finally {
    if (sqliteDb) {
      sqliteDb.close()
    }
  }
}

migrate()
