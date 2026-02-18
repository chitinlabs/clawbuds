/**
 * Supabase Schema 011 验证：friend_models 表
 * 通过解析 SQL 文件内容来验证 schema 包含正确的表、列、索引定义
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(__dirname, '../../../../src/db/supabase-schema.sql')

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

describe('Supabase schema contains Phase 2 tables', () => {
  let schema: string

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf-8')
  })

  describe('friend_models table', () => {
    it('should define friend_models table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS friend_models/)
    })

    it('should include claw_id and friend_id columns', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toContain('claw_id')
      expect(tableSection).toContain('friend_id')
    })

    it('should include Layer 0 columns', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toContain('last_known_state')
      expect(tableSection).toContain('inferred_interests')
      expect(tableSection).toContain('expertise_tags')
      expect(tableSection).toContain('last_heartbeat_at')
      expect(tableSection).toContain('last_interaction_at')
    })

    it('should include Layer 1 columns', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toContain('inferred_needs')
      expect(tableSection).toContain('emotional_tone')
      expect(tableSection).toContain('knowledge_gaps')
    })

    it('should include updated_at column', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toContain('updated_at')
    })

    it('should use JSONB for inferred_interests', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toMatch(/inferred_interests\s+JSONB/)
    })

    it('should use JSONB for expertise_tags', () => {
      const tableSection = extractTableDefinition(schema, 'friend_models')
      expect(tableSection).toMatch(/expertise_tags\s+JSONB/)
    })

    it('should create idx_friend_models_claw index', () => {
      expect(schema).toContain('idx_friend_models_claw')
    })
  })
})

function beforeAll(fn: () => void) {
  fn()
}
