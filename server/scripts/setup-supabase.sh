#!/bin/bash

# Setup Supabase Database Schema
# This script helps initialize the Supabase database

set -e

SUPABASE_URL="https://cmqcqaeqddqclzahdyzd.supabase.co"
PROJECT_ID="cmqcqaeqddqclzahdyzd"
SCHEMA_FILE="src/db/supabase-schema.sql"

echo "🚀 Supabase Database Setup"
echo "=========================="
echo ""
echo "Project: $PROJECT_ID"
echo "URL: $SUPABASE_URL"
echo ""

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi

echo "📄 Schema file: $SCHEMA_FILE ($(wc -l < $SCHEMA_FILE) lines)"
echo ""

# Option 1: Manual execution
echo "📋 Method 1: Manual Execution (Recommended)"
echo "============================================"
echo ""
echo "1. Open Supabase SQL Editor:"
echo "   https://supabase.com/dashboard/project/$PROJECT_ID/sql/new"
echo ""
echo "2. Copy the schema SQL:"
cat <<'EOF'
   cat src/db/supabase-schema.sql | pbcopy  # macOS
   cat src/db/supabase-schema.sql | xclip -selection clipboard  # Linux
EOF
echo ""
echo "3. Paste into SQL Editor and click 'Run'"
echo ""
echo "   OR: Copy from here:"
echo "   ----------------------------------------"
cat "$SCHEMA_FILE"
echo "   ----------------------------------------"
echo ""

# Option 2: Using Supabase CLI
echo "📋 Method 2: Using Supabase CLI"
echo "================================"
echo ""
echo "If you have Supabase CLI installed:"
echo ""
echo "   # Login"
echo "   supabase login"
echo ""
echo "   # Link project"
echo "   supabase link --project-ref $PROJECT_ID"
echo ""
echo "   # Apply schema"
echo "   supabase db push"
echo ""

# Option 3: Using psql (if database password is available)
echo "📋 Method 3: Using psql (Advanced)"
echo "==================================="
echo ""
echo "If you have the database password:"
echo ""
echo "   # Get connection string from:"
echo "   # https://supabase.com/dashboard/project/$PROJECT_ID/settings/database"
echo ""
echo "   psql 'postgresql://postgres:[YOUR-PASSWORD]@db.${PROJECT_ID}.supabase.co:5432/postgres' < $SCHEMA_FILE"
echo ""

echo "✅ After executing the schema, run:"
echo "   SUPABASE_URL=\"$SUPABASE_URL\" SUPABASE_PUBLISHABLE_KEY=\"\$SUPABASE_PUBLISHABLE_KEY\" npx tsx scripts/test-supabase-connection.ts"
echo ""
