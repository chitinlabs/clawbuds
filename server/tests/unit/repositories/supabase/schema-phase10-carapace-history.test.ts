/**
 * Supabase Schema Phase 10 验证：carapace_history 表
 * 通过解析迁移 SQL 文件内容验证 schema 包含正确的表、列、约束定义
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../../../../../supabase/migrations/20260221100000_phase10_carapace_history.sql'
)

function extractTableDefinition(sql: string, tableName: string): string {
  const startPattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\s*\\(`)
  const match = startPattern.exec(sql)
  if (!match) return ''

  let depth = 0
  let i = match.index
  for (; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') {
      depth--
      if (depth === 0) break
    }
  }
  return sql.slice(match.index, i + 1)
}

describe('Supabase migration Phase 10: carapace_history table', () => {
  let migration: string

  beforeAll(() => {
    migration = readFileSync(migrationPath, 'utf-8')
  })

  it('should create carapace_history table', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS carapace_history/)
  })

  it('should use UUID primary key', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toMatch(/id\s+UUID/)
    expect(table).toContain('gen_random_uuid()')
  })

  it('should reference claws with claw_id (TEXT, matching claws.claw_id)', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toMatch(/claw_id\s+TEXT/)
    expect(table).toContain('REFERENCES claws(claw_id)')
    expect(table).toContain('ON DELETE CASCADE')
  })

  it('should include version INTEGER NOT NULL', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toMatch(/version\s+INTEGER NOT NULL/)
  })

  it('should include content TEXT NOT NULL', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toMatch(/content\s+TEXT NOT NULL/)
  })

  it('should include change_reason with CHECK constraint and all 5 values', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toContain('change_reason')
    expect(table).toContain('micro_molt')
    expect(table).toContain('manual_edit')
    expect(table).toContain('allow')
    expect(table).toContain('escalate')
    expect(table).toContain('restore')
  })

  it('should default change_reason to manual_edit', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toContain("DEFAULT 'manual_edit'")
  })

  it('should include suggested_by with CHECK constraint', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toContain('suggested_by')
    expect(table).toContain("'system'")
    expect(table).toContain("'user'")
  })

  it('should default suggested_by to user', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toContain("DEFAULT 'user'")
  })

  it('should use TIMESTAMPTZ for created_at', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toMatch(/created_at\s+TIMESTAMPTZ/)
  })

  it('should include UNIQUE constraint on (claw_id, version)', () => {
    const table = extractTableDefinition(migration, 'carapace_history')
    expect(table).toContain('UNIQUE')
    expect(table).toContain('claw_id')
    expect(table).toContain('version')
  })

  it('should create index idx_carapace_history_claw', () => {
    expect(migration).toContain('idx_carapace_history_claw')
  })

  it('should enable Row Level Security', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('carapace_history')
  })
})
