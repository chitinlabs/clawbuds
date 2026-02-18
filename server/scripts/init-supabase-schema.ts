/**
 * Initialize Supabase Schema
 *
 * Creates all tables in Supabase database using the schema definition
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

async function initSchema() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration')
    process.exit(1)
  }

  console.log('📦 Initializing Supabase schema...')
  console.log(`URL: ${supabaseUrl}`)

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Read schema file
    const schemaPath = join(process.cwd(), 'src/db/supabase-schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    console.log('\n📄 Schema file loaded:', schemaPath)
    console.log(`   ${schema.split('\n').length} lines`)

    // Split schema into individual statements
    // We need to execute them one by one because Supabase doesn't support multi-statement execution via the client
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'))

    console.log(`\n🔨 Executing ${statements.length} SQL statements...`)

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement) continue

      // Extract table name from CREATE TABLE statement for logging
      const tableMatch = statement.match(/CREATE TABLE.*?(\w+)\s*\(/i)
      const indexMatch = statement.match(/CREATE INDEX.*?(\w+)\s+ON/i)
      const name = tableMatch?.[1] || indexMatch?.[1] || `statement ${i + 1}`

      process.stdout.write(`   ${i + 1}/${statements.length} ${name}... `)

      try {
        // Use rpc to execute raw SQL (requires a custom function in Supabase)
        // Alternative: use the REST API directly
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })

        if (error) {
          // If the function doesn't exist, we need to use a different approach
          if (error.code === 'PGRST202') {
            console.log('⚠️')
            console.log('\n⚠️  Cannot execute SQL via RPC (function not available)')
            console.log('Please execute the schema manually:')
            console.log('1. Go to https://supabase.com/dashboard/project/cmqcqaeqddqclzahdyzd/editor')
            console.log('2. Open SQL Editor')
            console.log('3. Copy and paste the contents of: src/db/supabase-schema.sql')
            console.log('4. Click "Run"\n')
            console.log('Alternatively, use the Supabase CLI:')
            console.log('   supabase db push')
            process.exit(1)
          }

          console.log(`❌ ${error.message}`)
          errorCount++
        } else {
          console.log('✅')
          successCount++
        }
      } catch (err: any) {
        console.log(`❌ ${err.message}`)
        errorCount++
      }
    }

    console.log(`\n📊 Results:`)
    console.log(`   ✅ Success: ${successCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)

    if (errorCount === 0) {
      console.log('\n🎉 Schema initialization complete!')
    } else {
      console.log('\n⚠️  Schema initialization completed with errors')
      process.exit(1)
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  }
}

initSchema()
