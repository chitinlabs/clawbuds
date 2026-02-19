/**
 * Supabase Schema 012 验证：pearls 系统 4 张表
 * 通过解析 SQL 文件内容来验证 schema 包含正确的表、列、索引定义
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../../../../src/db/supabase-schema.sql')

function extractTableDefinition(schema: string, tableName: string): string {
  const startPattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\s*\\(`)
  const match = startPattern.exec(schema)
  if (!match) return ''

  let depth = 0
  let i = match.index
  for (; i < schema.length; i++) {
    if (schema[i] === '(') depth++
    else if (schema[i] === ')') {
      depth--
      if (depth === 0) break
    }
  }
  return schema.slice(match.index, i + 1)
}

describe('Supabase schema contains Phase 3 pearl tables', () => {
  let schema: string

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf-8')
  })

  // ─── pearls 表 ─────────────────────────────────────────────────────────
  describe('pearls table', () => {
    it('should define pearls table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS pearls/)
    })

    it('should use UUID primary key', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toMatch(/id\s+UUID/)
    })

    it('should reference claws with owner_id (TEXT, matching claws.claw_id)', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toMatch(/owner_id\s+TEXT/)
      expect(tableSection).toContain('REFERENCES claws(claw_id)')
      expect(tableSection).toContain('ON DELETE CASCADE')
    })

    it('should include all Level 0 columns', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toContain('trigger_text')
      expect(tableSection).toContain('domain_tags')
      expect(tableSection).toContain('luster')
      expect(tableSection).toContain('shareability')
      expect(tableSection).toContain('share_conditions')
    })

    it('should include all Level 1 columns', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toContain('body')
      expect(tableSection).toContain('context')
      expect(tableSection).toContain('origin_type')
    })

    it('should use JSONB for domain_tags', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toMatch(/domain_tags\s+JSONB/)
    })

    it('should use JSONB for share_conditions', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toMatch(/share_conditions\s+JSONB/)
    })

    it('should use TIMESTAMPTZ for timestamps', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toMatch(/created_at\s+TIMESTAMPTZ/)
      expect(tableSection).toMatch(/updated_at\s+TIMESTAMPTZ/)
    })

    it('should include CHECK constraint on type', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toContain("'insight'")
      expect(tableSection).toContain("'framework'")
      expect(tableSection).toContain("'experience'")
    })

    it('should include CHECK constraint on shareability', () => {
      const tableSection = extractTableDefinition(schema, 'pearls')
      expect(tableSection).toContain("'private'")
      expect(tableSection).toContain("'friends_only'")
      expect(tableSection).toContain("'public'")
    })

    it('should create idx_pearls_owner index', () => {
      expect(schema).toContain('idx_pearls_owner')
    })

    it('should create idx_pearls_shareability index', () => {
      expect(schema).toContain('idx_pearls_shareability')
    })
  })

  // ─── pearl_references 表 ───────────────────────────────────────────────
  describe('pearl_references table', () => {
    it('should define pearl_references table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS pearl_references/)
    })

    it('should have UUID primary key and pearl_id FK', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_references')
      expect(tableSection).toMatch(/id\s+UUID/)
      expect(tableSection).toMatch(/pearl_id\s+UUID/)
      expect(tableSection).toContain('ON DELETE CASCADE')
    })

    it('should include type and content columns', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_references')
      expect(tableSection).toContain('type')
      expect(tableSection).toContain('content')
    })

    it('should create idx_pearl_references_pearl index', () => {
      expect(schema).toContain('idx_pearl_references_pearl')
    })
  })

  // ─── pearl_endorsements 表 ─────────────────────────────────────────────
  describe('pearl_endorsements table', () => {
    it('should define pearl_endorsements table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS pearl_endorsements/)
    })

    it('should have UUID primary key, pearl_id UUID, endorser_claw_id TEXT', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_endorsements')
      expect(tableSection).toMatch(/id\s+UUID/)
      expect(tableSection).toMatch(/pearl_id\s+UUID/)
      expect(tableSection).toMatch(/endorser_claw_id\s+TEXT/)  // TEXT (references claws.claw_id)
    })

    it('should include score with CHECK constraint', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_endorsements')
      expect(tableSection).toContain('score')
      expect(tableSection).toContain('0.0')
      expect(tableSection).toContain('1.0')
    })

    it('should include UNIQUE constraint', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_endorsements')
      expect(tableSection).toContain('UNIQUE')
    })

    it('should create idx_pearl_endorsements_pearl index', () => {
      expect(schema).toContain('idx_pearl_endorsements_pearl')
    })
  })

  // ─── pearl_shares 表 ───────────────────────────────────────────────────
  describe('pearl_shares table', () => {
    it('should define pearl_shares table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS pearl_shares/)
    })

    it('should have UUID primary key + pearl_id UUID, TEXT for claw references', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_shares')
      expect(tableSection).toMatch(/id\s+UUID/)
      expect(tableSection).toMatch(/pearl_id\s+UUID/)
      expect(tableSection).toMatch(/from_claw_id\s+TEXT/)  // TEXT (references claws.claw_id)
      expect(tableSection).toMatch(/to_claw_id\s+TEXT/)    // TEXT (references claws.claw_id)
    })

    it('should include UNIQUE constraint on (pearl_id, from_claw_id, to_claw_id)', () => {
      const tableSection = extractTableDefinition(schema, 'pearl_shares')
      expect(tableSection).toContain('UNIQUE')
    })

    it('should create idx_pearl_shares_to index', () => {
      expect(schema).toContain('idx_pearl_shares_to')
    })

    it('should create idx_pearl_shares_from index', () => {
      expect(schema).toContain('idx_pearl_shares_from')
    })
  })
})
