/**
 * Supabase Schema 014 验证：imprints 表 + RLS
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../../../../src/db/supabase-schema.sql')
const migrationPath = join(
  __dirname,
  '../../../../../supabase/migrations/20260220000000_phase5_imprints.sql'
)

describe('Supabase schema Phase 5: imprints table', () => {
  let schema: string
  let migration: string

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf-8')
    migration = readFileSync(migrationPath, 'utf-8')
  })

  describe('imprints table in supabase-schema.sql', () => {
    it('should define imprints table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS imprints/)
    })

    it('should have event_type CHECK constraint with 6 valid values', () => {
      expect(schema).toContain('new_job')
      expect(schema).toContain('travel')
      expect(schema).toContain('birthday')
      expect(schema).toContain('recovery')
      expect(schema).toContain('milestone')
      expect(schema).toContain("'other'")
    })

    it('should have summary length constraint', () => {
      expect(schema).toMatch(/length\(summary\)\s*<=\s*200/)
    })

    it('should have ENABLE ROW LEVEL SECURITY for imprints', () => {
      expect(schema).toMatch(/ALTER TABLE imprints ENABLE ROW LEVEL SECURITY/)
    })
  })

  describe('Supabase migration file 20260220000000', () => {
    it('should exist and create imprints table', () => {
      expect(migration).toMatch(/CREATE TABLE/)
      expect(migration).toContain('imprints')
    })

    it('should include RLS enable statement', () => {
      expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    })

    it('should include deny-all policy', () => {
      expect(migration).toContain('CREATE POLICY')
    })
  })
})
