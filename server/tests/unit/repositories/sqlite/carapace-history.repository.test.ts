/**
 * SQLite CarapaceHistoryRepository Unit Tests（Phase 10）
 * 覆盖 ICarapaceHistoryRepository 全方法
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteCarapaceHistoryRepository } from '../../../../src/db/repositories/sqlite/carapace-history.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import { randomUUID } from 'node:crypto'

describe('SQLiteCarapaceHistoryRepository', () => {
  let db: Database.Database
  let repo: SQLiteCarapaceHistoryRepository
  let clawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    repo = new SQLiteCarapaceHistoryRepository(db)
    const clawRepo = new SQLiteClawRepository(db)
    const claw = await clawRepo.register({ publicKey: 'pk-test', displayName: 'TestClaw' })
    clawId = claw.clawId
  })

  afterEach(() => db.close())

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a history record with required fields', async () => {
      const id = randomUUID()
      const record = await repo.create({
        id,
        clawId,
        content: '## carapace\n内容',
        changeReason: 'manual_edit',
        suggestedBy: 'user',
      })

      expect(record.id).toBe(id)
      expect(record.clawId).toBe(clawId)
      expect(record.content).toBe('## carapace\n内容')
      expect(record.changeReason).toBe('manual_edit')
      expect(record.suggestedBy).toBe('user')
      expect(record.version).toBe(1)  // 第一条记录版本号为 1
      expect(record.createdAt).toBeTruthy()
    })

    it('should auto-increment version per claw', async () => {
      await repo.create({ id: randomUUID(), clawId, content: 'v1', changeReason: 'manual_edit', suggestedBy: 'user' })
      await repo.create({ id: randomUUID(), clawId, content: 'v2', changeReason: 'allow', suggestedBy: 'system' })
      const records = await repo.findByOwner(clawId)
      const versions = records.map((r) => r.version).sort((a, b) => a - b)
      expect(versions).toEqual([1, 2])
    })

    it('should accept all valid change_reason values', async () => {
      const reasons = ['micro_molt', 'manual_edit', 'allow', 'escalate', 'restore'] as const
      for (const reason of reasons) {
        await expect(
          repo.create({ id: randomUUID(), clawId, content: `${reason} content`, changeReason: reason, suggestedBy: 'user' })
        ).resolves.not.toThrow()
      }
    })

    it('should accept both suggested_by values', async () => {
      await expect(
        repo.create({ id: randomUUID(), clawId, content: 'sys', changeReason: 'micro_molt', suggestedBy: 'system' })
      ).resolves.not.toThrow()
      await expect(
        repo.create({ id: randomUUID(), clawId, content: 'usr', changeReason: 'manual_edit', suggestedBy: 'user' })
      ).resolves.not.toThrow()
    })
  })

  // ─── getLatestVersion ──────────────────────────────────────────────────────

  describe('getLatestVersion', () => {
    it('should return 0 when no history exists', async () => {
      const version = await repo.getLatestVersion(clawId)
      expect(version).toBe(0)
    })

    it('should return the highest version number', async () => {
      await repo.create({ id: randomUUID(), clawId, content: 'v1', changeReason: 'manual_edit', suggestedBy: 'user' })
      await repo.create({ id: randomUUID(), clawId, content: 'v2', changeReason: 'allow', suggestedBy: 'user' })
      const version = await repo.getLatestVersion(clawId)
      expect(version).toBe(2)
    })

    it('should be isolated per claw', async () => {
      const clawRepo = new SQLiteClawRepository(db)
      const claw2 = await clawRepo.register({ publicKey: 'pk-other', displayName: 'OtherClaw' })
      await repo.create({ id: randomUUID(), clawId, content: 'v1', changeReason: 'manual_edit', suggestedBy: 'user' })
      const version = await repo.getLatestVersion(claw2.clawId)
      expect(version).toBe(0)
    })
  })

  // ─── findByOwner ───────────────────────────────────────────────────────────

  describe('findByOwner', () => {
    it('should return empty array when no history', async () => {
      const records = await repo.findByOwner(clawId)
      expect(records).toEqual([])
    })

    it('should return records sorted by version descending', async () => {
      await repo.create({ id: randomUUID(), clawId, content: 'v1', changeReason: 'manual_edit', suggestedBy: 'user' })
      await repo.create({ id: randomUUID(), clawId, content: 'v2', changeReason: 'allow', suggestedBy: 'user' })
      await repo.create({ id: randomUUID(), clawId, content: 'v3', changeReason: 'micro_molt', suggestedBy: 'system' })
      const records = await repo.findByOwner(clawId)
      expect(records.map((r) => r.version)).toEqual([3, 2, 1])
    })

    it('should apply limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: randomUUID(), clawId, content: `v${i + 1}`, changeReason: 'manual_edit', suggestedBy: 'user' })
      }
      const records = await repo.findByOwner(clawId, { limit: 3 })
      expect(records).toHaveLength(3)
      expect(records[0].version).toBe(5)  // 最新的
    })

    it('should apply offset filter', async () => {
      for (let i = 0; i < 4; i++) {
        await repo.create({ id: randomUUID(), clawId, content: `v${i + 1}`, changeReason: 'manual_edit', suggestedBy: 'user' })
      }
      const records = await repo.findByOwner(clawId, { limit: 2, offset: 2 })
      expect(records).toHaveLength(2)
      expect(records[0].version).toBe(2)  // 倒数第 3 个
    })
  })

  // ─── findByVersion ─────────────────────────────────────────────────────────

  describe('findByVersion', () => {
    it('should return null for non-existent version', async () => {
      const record = await repo.findByVersion(clawId, 999)
      expect(record).toBeNull()
    })

    it('should return the correct record by version', async () => {
      await repo.create({ id: randomUUID(), clawId, content: 'v1 content', changeReason: 'manual_edit', suggestedBy: 'user' })
      await repo.create({ id: randomUUID(), clawId, content: 'v2 content', changeReason: 'allow', suggestedBy: 'user' })
      const record = await repo.findByVersion(clawId, 1)
      expect(record).not.toBeNull()
      expect(record!.content).toBe('v1 content')
      expect(record!.version).toBe(1)
    })
  })

  // ─── pruneOldVersions ──────────────────────────────────────────────────────

  describe('pruneOldVersions', () => {
    it('should delete old versions keeping the most recent N', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({ id: randomUUID(), clawId, content: `v${i + 1}`, changeReason: 'manual_edit', suggestedBy: 'user' })
      }
      const deleted = await repo.pruneOldVersions(clawId, 3)
      expect(deleted).toBe(2)
      const remaining = await repo.findByOwner(clawId)
      expect(remaining).toHaveLength(3)
      // 保留最新的 3 个版本（3, 4, 5）
      expect(remaining.map((r) => r.version)).toEqual([5, 4, 3])
    })

    it('should return 0 when no pruning needed', async () => {
      await repo.create({ id: randomUUID(), clawId, content: 'v1', changeReason: 'manual_edit', suggestedBy: 'user' })
      const deleted = await repo.pruneOldVersions(clawId, 10)
      expect(deleted).toBe(0)
    })
  })
})
