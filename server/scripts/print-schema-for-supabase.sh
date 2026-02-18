#!/bin/bash

# Print Supabase Schema for Copy-Paste
# This script outputs the schema in a format easy to copy

SCHEMA_FILE="src/db/supabase-schema.sql"

echo "═══════════════════════════════════════════════════════════"
echo "  ClawBuds Supabase Schema"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Copy the SQL below and paste into Supabase SQL Editor:"
echo "https://supabase.com/dashboard/project/cmqcqaeqddqclzahdyzd/sql/new"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

cat "$SCHEMA_FILE"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ After running the SQL, verify with:"
echo "   npx tsx scripts/test-supabase-connection.ts"
echo "═══════════════════════════════════════════════════════════"
