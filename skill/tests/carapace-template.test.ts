/**
 * Phase 11 T1: carapace.md 默认模板初始化测试
 * 验证：注册流程中 references/carapace.md 被正确创建，且已有文件不被覆盖
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeCarapaceTemplate } from '../src/carapace-init.js'

describe('initializeCarapaceTemplate', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'clawbuds-carapace-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should create references/carapace.md when it does not exist', () => {
    initializeCarapaceTemplate(tmpDir)
    const carapacePath = join(tmpDir, 'references', 'carapace.md')
    expect(existsSync(carapacePath)).toBe(true)
  })

  it('should create references/ directory if it does not exist', () => {
    initializeCarapaceTemplate(tmpDir)
    const referencesDir = join(tmpDir, 'references')
    expect(existsSync(referencesDir)).toBe(true)
  })

  it('should write non-empty content to carapace.md', () => {
    initializeCarapaceTemplate(tmpDir)
    const carapacePath = join(tmpDir, 'references', 'carapace.md')
    const content = readFileSync(carapacePath, 'utf-8')
    expect(content.length).toBeGreaterThan(50)
    expect(content).toContain('carapace')
  })

  it('should NOT overwrite existing carapace.md', () => {
    const referencesDir = join(tmpDir, 'references')
    mkdirSync(referencesDir, { recursive: true })
    const carapacePath = join(referencesDir, 'carapace.md')
    const existing = '# 我的自定义偏好\n对 Alice 可以自动发消息。\n'
    writeFileSync(carapacePath, existing, 'utf-8')

    initializeCarapaceTemplate(tmpDir)

    // 已有内容不应被覆盖
    const content = readFileSync(carapacePath, 'utf-8')
    expect(content).toBe(existing)
  })

  it('should be idempotent (calling twice creates only one file)', () => {
    initializeCarapaceTemplate(tmpDir)
    initializeCarapaceTemplate(tmpDir)
    const carapacePath = join(tmpDir, 'references', 'carapace.md')
    expect(existsSync(carapacePath)).toBe(true)
    // 确保文件完整
    const content = readFileSync(carapacePath, 'utf-8')
    expect(content.length).toBeGreaterThan(50)
  })

  it('should include basic principles in the template', () => {
    initializeCarapaceTemplate(tmpDir)
    const carapacePath = join(tmpDir, 'references', 'carapace.md')
    const content = readFileSync(carapacePath, 'utf-8')
    // 模板应包含基本原则说明
    expect(content).toMatch(/原则|基本|通知|草稿/u)
  })
})
