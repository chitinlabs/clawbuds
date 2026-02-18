/**
 * Test Supabase Connection
 *
 * Verifies that we can connect to Supabase and access the database
 */

import { createClient } from '@supabase/supabase-js'

async function testConnection() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY ||
                      process.env.SUPABASE_PUBLISHABLE_KEY ||
                      process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration')
    console.error('Required: SUPABASE_URL and (SUPABASE_SECRET_KEY or SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY)')
    process.exit(1)
  }

  console.log('🔗 Testing Supabase connection...')
  console.log(`URL: ${supabaseUrl}`)
  console.log(`Key: ${supabaseKey.substring(0, 20)}...`)

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Test connection by executing a simple query
    const { data, error } = await supabase.rpc('version')

    if (error && error.code !== 'PGRST202') {
      // PGRST202 = function not found, but connection is OK
      console.error('❌ Connection error:', error.message)
      console.error('Error code:', error.code)

      // If it's a permissions error, that's still a successful connection
      if (error.code === '42501') {
        console.log('✅ Connection successful! (permissions limited, but connected)')
        return supabase
      }

      process.exit(1)
    }

    console.log('✅ Connection successful!')
    if (data) {
      console.log('PostgreSQL version:', data)
    }

    // Try to list any existing tables by attempting to query 'claws' table
    console.log('\n📊 Checking for existing tables...')
    const { data: clawsData, error: clawsError } = await supabase
      .from('claws')
      .select('claw_id')
      .limit(1)

    if (clawsError) {
      if (clawsError.code === 'PGRST116') {
        console.log('⚠️  Table "claws" does not exist - database needs initialization')
      } else {
        console.log(`⚠️  Error checking tables: ${clawsError.message}`)
      }
    } else {
      console.log('✅ Table "claws" exists')
      console.log(`   Found ${clawsData?.length || 0} rows`)
    }

    return supabase
  } catch (err) {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  }
}

testConnection()
