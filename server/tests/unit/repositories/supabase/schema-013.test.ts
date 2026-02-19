/**
 * Supabase Schema 013 验证：reflexes + reflex_executions 两张表
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

describe('Supabase schema contains Phase 4 reflex tables', () => {
  let schema: string

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf-8')
  })

  describe('reflexes table', () => {
    it('should define reflexes table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS reflexes/)
    })

    it('should have UUID primary key', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toMatch(/id\s+UUID/)
    })

    it('should reference claws with TEXT claw_id', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toMatch(/claw_id\s+TEXT/)
      expect(section).toContain('REFERENCES claws(claw_id)')
    })

    it('should include all required columns', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toContain('name')
      expect(section).toContain('value_layer')
      expect(section).toContain('behavior')
      expect(section).toContain('trigger_layer')
      expect(section).toContain('trigger_config')
      expect(section).toContain('enabled')
      expect(section).toContain('confidence')
      expect(section).toContain('source')
    })

    it('should use JSONB for trigger_config', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toMatch(/trigger_config\s+JSONB/)
    })

    it('should use BOOLEAN for enabled', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toMatch(/enabled\s+BOOLEAN/)
    })

    it('should create idx_reflexes_claw_enabled index', () => {
      expect(schema).toContain('idx_reflexes_claw_enabled')
    })

    it('should have UNIQUE(claw_id, name)', () => {
      const section = extractTableDefinition(schema, 'reflexes')
      expect(section).toContain('UNIQUE')
    })
  })

  describe('reflex_executions table', () => {
    it('should define reflex_executions table', () => {
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS reflex_executions/)
    })

    it('should have UUID primary key and UUID FK fields', () => {
      const section = extractTableDefinition(schema, 'reflex_executions')
      expect(section).toMatch(/id\s+UUID/)
      expect(section).toMatch(/reflex_id\s+UUID/)
    })

    it('should have claw_id as TEXT', () => {
      const section = extractTableDefinition(schema, 'reflex_executions')
      expect(section).toMatch(/claw_id\s+TEXT/)
    })

    it('should use JSONB for trigger_data and details', () => {
      const section = extractTableDefinition(schema, 'reflex_executions')
      expect(section).toMatch(/trigger_data\s+JSONB/)
      expect(section).toMatch(/details\s+JSONB/)
    })

    it('should include execution_result CHECK constraint', () => {
      const section = extractTableDefinition(schema, 'reflex_executions')
      expect(section).toContain('executed')
      expect(section).toContain('blocked')
      expect(section).toContain('queued_for_l1')
    })

    it('should create all 3 indexes', () => {
      expect(schema).toContain('idx_reflex_executions_claw')
      expect(schema).toContain('idx_reflex_executions_reflex')
      expect(schema).toContain('idx_reflex_executions_result')
    })
  })
})
