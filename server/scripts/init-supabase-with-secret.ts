/**
 * Initialize Supabase Schema with Service Role Key
 *
 * Uses PostgreSQL client to directly execute schema SQL
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

const { Client } = pg

async function initSchema() {
  const supabaseUrl = process.env.SUPABASE_URL
  const projectRef = supabaseUrl?.match(/https:\/\/(.+?)\.supabase\.co/)?.[1]

  if (!supabaseUrl || !projectRef) {
    console.error('❌ Invalid SUPABASE_URL')
    process.exit(1)
  }

  // For direct database access, we need the database password
  // The service role key is for API access, not direct database connection
  // We'll use Supabase's PostgREST API instead

  console.log('📦 Initializing Supabase schema via API...')
  console.log(`Project: ${projectRef}`)

  try {
    // Read schema file
    const schemaPath = join(process.cwd(), 'src/db/supabase-schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    console.log(`\n📄 Schema file: ${schemaPath}`)
    console.log(`   ${schema.split('\n').length} lines`)

    // We need to use the Supabase Management API or direct psql connection
    console.log('\n⚠️  Direct SQL execution requires database password')
    console.log('\nOptions:')
    console.log('1. Use Supabase SQL Editor (recommended):')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`)
    console.log('\n2. Use psql with database connection string:')
    console.log('   Get connection string from:')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/settings/database`)
    console.log('\n3. Use Supabase CLI:')
    console.log('   supabase db push')

    // Let's try a different approach - execute each statement via REST API
    console.log('\n🔄 Attempting to execute via Management API...')

    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY
    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SECRET_KEY not set')
      process.exit(1)
    }

    // Use fetch to call Supabase Management API
    // Note: This requires the project service role key
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: schema })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ API Error:', error)

      // If function doesn't exist, provide alternative
      if (error.includes('PGRST202') || error.includes('function')) {
        console.log('\n💡 Alternative approach: Use Supabase SQL Editor')
        console.log('   Copy the schema from: src/db/supabase-schema.sql')
        console.log('   Paste into: https://supabase.com/dashboard/project/${projectRef}/sql/new')
        console.log('   Click "Run"')
      }

      process.exit(1)
    }

    console.log('✅ Schema initialized successfully!')
  } catch (err: any) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

initSchema()
