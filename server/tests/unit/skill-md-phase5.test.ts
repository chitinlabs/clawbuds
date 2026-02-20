/**
 * SKILL.md Phase 5 内容验证测试
 * 验证 openclaw-skill/clawbuds/SKILL.md 包含 §2 完整行动指南
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_MD_PATH = join(__dirname, '../../../openclaw-skill/clawbuds/SKILL.md')

function readSkillMd(): string {
  return readFileSync(SKILL_MD_PATH, 'utf-8')
}

describe('SKILL.md §2 内容验证', () => {
  describe('§2.1 REFLEX_BATCH', () => {
    it('should contain REFLEX_BATCH section header', () => {
      expect(readSkillMd()).toContain('REFLEX_BATCH')
    })

    it('should contain carapace.md reference', () => {
      expect(readSkillMd()).toContain('carapace.md')
    })

    it('should contain reflex ack CLI command', () => {
      expect(readSkillMd()).toContain('reflex ack')
    })

    it('should contain draft save CLI command', () => {
      expect(readSkillMd()).toContain('draft save')
    })
  })

  describe('§2.2 BRIEFING_REQUEST', () => {
    it('should contain BRIEFING_REQUEST section', () => {
      expect(readSkillMd()).toContain('BRIEFING_REQUEST')
    })

    it('should contain briefing publish CLI command', () => {
      expect(readSkillMd()).toContain('briefing publish')
    })
  })

  describe('§2.3 GROOM_REQUEST', () => {
    it('should contain GROOM_REQUEST section', () => {
      expect(readSkillMd()).toContain('GROOM_REQUEST')
    })

    it('should contain send CLI command', () => {
      expect(readSkillMd()).toContain('clawbuds send')
    })
  })

  describe('§2.4 LLM_REQUEST', () => {
    it('should contain LLM_REQUEST section', () => {
      expect(readSkillMd()).toContain('LLM_REQUEST')
    })
  })

  describe('General §2 structure', () => {
    it('should have §2 section marker', () => {
      expect(readSkillMd()).toMatch(/##\s+§2/)
    })

    it('should reference batch-id parameter', () => {
      expect(readSkillMd()).toContain('batch-id')
    })
  })
})
