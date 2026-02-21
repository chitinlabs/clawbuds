/**
 * CarapaceEditor Service Unit Tests（Phase 10）
 * 覆盖 allow/escalate/applyMicroMolt/restoreVersion/backupCurrentVersion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { CarapaceEditor } from '../../../src/services/carapace-editor.js'
import type { ICarapaceHistoryRepository } from '../../../src/db/repositories/interfaces/carapace-history.repository.interface.js'
import type { MicroMoltSuggestion } from '../../../src/services/micro-molt.service.js'

const clawId = 'claw-test-editor'

function makeHistoryRecord(version: number) {
  return {
    id: randomUUID(),
    clawId,
    version,
    content: `## carapace\nVersion ${version}`,
    changeReason: 'manual_edit' as const,
    suggestedBy: 'user' as const,
    createdAt: new Date().toISOString(),
  }
}

describe('CarapaceEditor', () => {
  let carapacePath: string
  let mockHistoryRepo: ICarapaceHistoryRepository
  let editor: CarapaceEditor
  let versionCounter: number

  beforeEach(() => {
    // 创建临时 carapace.md 文件
    carapacePath = join(tmpdir(), `carapace-test-${randomUUID()}.md`)
    writeFileSync(carapacePath, '## 分享规则\n\n默认规则：所有操作需要审阅\n')
    versionCounter = 0

    mockHistoryRepo = {
      create: vi.fn().mockImplementation(async (data) => {
        versionCounter++
        return makeHistoryRecord(versionCounter)
      }),
      getLatestVersion: vi.fn().mockImplementation(async () => versionCounter),
      findByOwner: vi.fn().mockResolvedValue([]),
      findByVersion: vi.fn().mockImplementation(async (_, version) =>
        version <= versionCounter ? makeHistoryRecord(version) : null
      ),
      pruneOldVersions: vi.fn().mockResolvedValue(0),
    }

    editor = new CarapaceEditor(mockHistoryRepo, carapacePath, clawId)
  })

  afterEach(() => {
    if (existsSync(carapacePath)) unlinkSync(carapacePath)
  })

  // ─── allow ────────────────────────────────────────────────────────────────

  describe('allow', () => {
    it('should append an allow rule to carapace.md', async () => {
      await editor.allow('alice', '日常梳理消息')
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('alice')
      expect(content).toContain('日常梳理消息')
    })

    it('should include Micro-Molt annotation comment', async () => {
      await editor.allow('alice', '日常梳理消息', '7 天审批率 100%')
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('<!-- Micro-Molt:')
    })

    it('should backup current version before modifying', async () => {
      await editor.allow('alice', '梳理消息')
      expect(mockHistoryRepo.create).toHaveBeenCalledOnce()
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ changeReason: 'allow', clawId })
      )
    })

    it('should not remove existing content', async () => {
      const originalContent = readFileSync(carapacePath, 'utf-8')
      await editor.allow('bob', '日常消息')
      const newContent = readFileSync(carapacePath, 'utf-8')
      expect(newContent).toContain('默认规则：所有操作需要审阅')
      expect(newContent.length).toBeGreaterThan(originalContent.length)
    })
  })

  // ─── escalate ─────────────────────────────────────────────────────────────

  describe('escalate', () => {
    it('should append an escalate rule to carapace.md', async () => {
      await editor.escalate('当 Pearl 涉及敏感领域时', '需要人工审阅')
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('当 Pearl 涉及敏感领域时')
    })

    it('should include Micro-Molt annotation comment', async () => {
      await editor.escalate('condition', 'action')
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('<!-- Micro-Molt:')
    })

    it('should backup with escalate reason', async () => {
      await editor.escalate('condition', 'action')
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ changeReason: 'escalate', clawId })
      )
    })
  })

  // ─── applyMicroMolt ───────────────────────────────────────────────────────

  describe('applyMicroMolt', () => {
    it('should apply an allow-type suggestion', async () => {
      const suggestion: MicroMoltSuggestion = {
        type: 'allow',
        description: '对 Alice 添加自动梳理授权',
        cliCommand: 'clawbuds carapace allow --friend alice --scope "日常梳理"',
        confidence: 0.9,
        friendId: 'alice',
        scope: '日常梳理',
      }
      await editor.applyMicroMolt(suggestion)
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('alice')
    })

    it('should apply an escalate-type suggestion', async () => {
      const suggestion: MicroMoltSuggestion = {
        type: 'escalate',
        description: '需要升级策略',
        cliCommand: 'clawbuds carapace escalate --when "..." --action "..."',
        confidence: 0.8,
        condition: 'Pearl 涉及金融话题',
        action: '需要人工审阅',
      }
      await editor.applyMicroMolt(suggestion)
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toContain('Pearl 涉及金融话题')
    })

    it('should backup with micro_molt reason', async () => {
      const suggestion: MicroMoltSuggestion = {
        type: 'allow',
        description: '测试',
        cliCommand: 'test',
        confidence: 0.9,
        friendId: 'charlie',
        scope: '测试范围',
      }
      await editor.applyMicroMolt(suggestion)
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ changeReason: 'micro_molt', clawId })
      )
    })
  })

  // ─── restoreVersion ───────────────────────────────────────────────────────

  describe('restoreVersion', () => {
    it('should restore content from history record', async () => {
      const targetContent = '## carapace\nVersion 3 content'
      vi.mocked(mockHistoryRepo.findByVersion).mockResolvedValueOnce({
        id: randomUUID(),
        clawId,
        version: 3,
        content: targetContent,
        changeReason: 'manual_edit',
        suggestedBy: 'user',
        createdAt: new Date().toISOString(),
      })

      await editor.restoreVersion(3)
      const content = readFileSync(carapacePath, 'utf-8')
      expect(content).toBe(targetContent)
    })

    it('should backup current version before restoring', async () => {
      vi.mocked(mockHistoryRepo.findByVersion).mockResolvedValueOnce(makeHistoryRecord(2))
      await editor.restoreVersion(2)
      expect(mockHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ changeReason: 'restore', clawId })
      )
    })

    it('should throw if version not found', async () => {
      vi.mocked(mockHistoryRepo.findByVersion).mockResolvedValueOnce(null)
      await expect(editor.restoreVersion(999)).rejects.toThrow()
    })
  })
})
