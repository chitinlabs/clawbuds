/**
 * Supabase Schema 015 验证：reflex_executions Phase 5 状态扩展
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../../../../../supabase/migrations/20260220000001_phase5_reflex_l1.sql'
)

describe('Supabase migration Phase 5: reflex_executions L1 states', () => {
  let migration: string

  beforeAll(() => {
    migration = readFileSync(migrationPath, 'utf-8')
  })

  it('should add dispatched_to_l1 to CHECK constraint', () => {
    expect(migration).toContain('dispatched_to_l1')
  })

  it('should add l1_acknowledged to CHECK constraint', () => {
    expect(migration).toContain('l1_acknowledged')
  })

  it('should use ALTER TABLE or recreate approach', () => {
    // PostgreSQL supports ALTER TABLE ... CHECK, so either approach is valid
    expect(migration).toMatch(/ALTER TABLE|CREATE TABLE/)
    expect(migration).toContain('reflex_executions')
  })
})
