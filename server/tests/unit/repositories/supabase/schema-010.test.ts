/**
 * Supabase Schema 010 验证：heartbeats + relationship_strength + status_text
 * 通过解析 SQL 文件内容来验证 schema 包含正确的表、列、索引定义
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../../../../src/db/supabase-schema.sql')

describe('Supabase schema contains Phase 1 tables', () => {
  let schema: string

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf-8')
  })

  describe('heartbeats table', () => {
    it('should define heartbeats table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS heartbeats/)
    })

    it('should include from_claw_id column', () => {
      const tableSection = extractTableDefinition(schema, 'heartbeats')
      expect(tableSection).toContain('from_claw_id')
    })

    it('should include to_claw_id column', () => {
      const tableSection = extractTableDefinition(schema, 'heartbeats')
      expect(tableSection).toContain('to_claw_id')
    })

    it('should include interests, availability, recent_topics columns', () => {
      const tableSection = extractTableDefinition(schema, 'heartbeats')
      expect(tableSection).toContain('interests')
      expect(tableSection).toContain('availability')
      expect(tableSection).toContain('recent_topics')
    })

    it('should include is_keepalive column', () => {
      const tableSection = extractTableDefinition(schema, 'heartbeats')
      expect(tableSection).toContain('is_keepalive')
    })

    it('should create idx_heartbeats_to_claw index', () => {
      expect(schema).toContain('idx_heartbeats_to_claw')
    })

    it('should create idx_heartbeats_from_to index', () => {
      expect(schema).toContain('idx_heartbeats_from_to')
    })
  })

  describe('relationship_strength table', () => {
    it('should define relationship_strength table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS relationship_strength/)
    })

    it('should include claw_id and friend_id columns', () => {
      const tableSection = extractTableDefinition(schema, 'relationship_strength')
      expect(tableSection).toContain('claw_id')
      expect(tableSection).toContain('friend_id')
    })

    it('should include strength column with default 0.5', () => {
      const tableSection = extractTableDefinition(schema, 'relationship_strength')
      expect(tableSection).toContain('strength')
      expect(tableSection).toContain('0.5')
    })

    it('should include dunbar_layer with CHECK constraint', () => {
      const tableSection = extractTableDefinition(schema, 'relationship_strength')
      expect(tableSection).toContain('dunbar_layer')
      expect(tableSection).toContain("'core'")
      expect(tableSection).toContain("'sympathy'")
      expect(tableSection).toContain("'active'")
      expect(tableSection).toContain("'casual'")
    })

    it('should include manual_override column', () => {
      const tableSection = extractTableDefinition(schema, 'relationship_strength')
      expect(tableSection).toContain('manual_override')
    })

    it('should create idx_rs_claw_strength index', () => {
      expect(schema).toContain('idx_rs_claw_strength')
    })

    it('should create idx_rs_claw_layer index', () => {
      expect(schema).toContain('idx_rs_claw_layer')
    })
  })

  describe('claws.status_text column', () => {
    it('should include status_text in claws table', () => {
      const tableSection = extractTableDefinition(schema, 'claws')
      expect(tableSection).toContain('status_text')
    })
  })
})

/**
 * 从 schema SQL 中提取指定表的 CREATE TABLE 块
 */
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

function beforeAll(fn: () => void) {
  fn()
}
