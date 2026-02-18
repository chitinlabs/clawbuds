/**
 * Initialize Supabase Schema via Direct PostgreSQL Connection
 *
 * Usage: node scripts/init-supabase-direct.mjs
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Database connection string
const connectionString = process.env.DATABASE_URL ||
  'postgresql://postgres:Clawbuds2026@db.cmqcqaeqddqclzahdyzd.supabase.co:5432/postgres'

console.log('📦 Initializing Supabase schema via direct PostgreSQL connection...')
console.log(`Database: ${connectionString.replace(/:[^:@]+@/, ':****@')}`)

async function initSchema() {
  // Use global NODE_PATH to find pg
  let pg
  try {
    // Try standard import first
    pg = await import('pg')
  } catch (err) {
    try {
      // Try importing from global node_modules
      const globalPath = '/data/doris/wyh/nvm/versions/node/v22.18.0/lib/node_modules/pg/lib/index.js'
      pg = await import(globalPath)
    } catch (err2) {
      console.error('❌ pg package not found')
      console.error('Please set NODE_PATH or install pg globally')
      console.error('Run: export NODE_PATH=$(npm root -g)')
      process.exit(1)
    }
  }

  const { Client } = pg.default || pg

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Supabase requires SSL
    },
    // Force use of IPv4 family
    keepAlive: true,
    connectionTimeoutMillis: 10000
  })

  try {
    // Connect to database
    console.log('\n🔗 Connecting to database...')
    await client.connect()
    console.log('✅ Connected!')

    // Read schema file
    const schemaPath = join(__dirname, '..', 'src', 'db', 'supabase-schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    console.log(`\n📄 Schema file: ${schemaPath}`)
    console.log(`   ${schema.split('\n').length} lines`)

    // Execute schema
    console.log('\n🔨 Executing schema...')
    await client.query(schema)

    console.log('✅ Schema executed successfully!')

    // Verify by listing tables
    console.log('\n📊 Verifying tables...')
    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)

    console.log(`✅ Created ${result.rows.length} tables:`)
    result.rows.forEach(row => {
      console.log(`   - ${row.tablename}`)
    })

    console.log('\n🎉 Supabase schema initialization complete!')

  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.code) {
      console.error(`   Code: ${err.code}`)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

initSchema()
