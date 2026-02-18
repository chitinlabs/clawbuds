/**
 * Verify Supabase Data
 *
 * Check if data was successfully migrated to Supabase
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required')
  process.exit(1)
}

async function verifyData() {
  console.log('🔍 Verifying Supabase Data')
  console.log('==========================')

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const tables = [
    'claws',
    'friendships',
    'messages',
    'message_recipients',
    'inbox_entries',
    'seq_counters',
  ]

  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: false })

    if (error) {
      console.log(`❌ ${table}: Error - ${error.message}`)
    } else {
      console.log(`✅ ${table}: ${count} rows`)
      if (count && count > 0 && count <= 3) {
        console.log(`   Sample:`, JSON.stringify(data?.slice(0, 1), null, 2))
      }
    }
  }
}

verifyData()
