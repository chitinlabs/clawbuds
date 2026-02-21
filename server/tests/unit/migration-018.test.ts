/**
 * Migration 018: Thread V5 表结构验证（Phase 8）
 * TDD 红灯：migration 尚未创建时这些测试应失败
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../src/db/database.js'
import { SQLiteClawRepository } from '../../src/db/repositories/sqlite/claw.repository.js'

describe('Migration 018: Thread V5 表', () => {
  let db: Database.Database
  let clawIdA: string
  let clawIdB: string

  beforeEach(async () => {
    db = createTestDatabase()
    const clawRepo = new SQLiteClawRepository(db)
    const clawA = await clawRepo.register({ publicKey: 'pk-thread-a', displayName: 'ThreadA' })
    const clawB = await clawRepo.register({ publicKey: 'pk-thread-b', displayName: 'ThreadB' })
    clawIdA = clawA.clawId
    clawIdB = clawB.clawId
  })

  afterEach(() => db.close())

  // ─── threads_v5 ───────────────────────────────────────────────────────────

  describe('threads_v5 表', () => {
    it('should create threads_v5 table', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='threads_v5'")
        .get()
      expect(result).toBeTruthy()
    })

    it('should have all required columns', () => {
      const cols = db.prepare('PRAGMA table_info(threads_v5)').all() as Array<{ name: string }>
      const colNames = cols.map((c) => c.name)
      expect(colNames).toContain('id')
      expect(colNames).toContain('creator_id')
      expect(colNames).toContain('purpose')
      expect(colNames).toContain('title')
      expect(colNames).toContain('status')
      expect(colNames).toContain('created_at')
      expect(colNames).toContain('updated_at')
    })

    it('should default status to active', () => {
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run('thr_001', clawIdA, 'tracking', 'Test Thread')
      const row = db
        .prepare("SELECT status FROM threads_v5 WHERE id = 'thr_001'")
        .get() as { status: string }
      expect(row.status).toBe('active')
    })

    it('should enforce purpose CHECK constraint', () => {
      expect(() => {
        db.prepare(
          `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
        ).run('thr_bad', clawIdA, 'invalid_purpose', 'Bad Thread')
      }).toThrow()
    })

    it('should accept all valid purposes', () => {
      const purposes = ['tracking', 'debate', 'creation', 'accountability', 'coordination']
      purposes.forEach((p, i) => {
        expect(() => {
          db.prepare(
            `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
          ).run(`thr_${i}`, clawIdA, p, `Thread ${p}`)
        }).not.toThrow()
      })
    })

    it('should enforce status CHECK constraint', () => {
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run('thr_st', clawIdA, 'debate', 'Status Test')
      expect(() => {
        db.prepare(
          `UPDATE threads_v5 SET status = ? WHERE id = ?`
        ).run('invalid_status', 'thr_st')
      }).toThrow()
    })

    it('should accept all valid statuses', () => {
      const statuses = ['active', 'completed', 'archived']
      statuses.forEach((s, i) => {
        db.prepare(
          `INSERT INTO threads_v5 (id, creator_id, purpose, title, status) VALUES (?, ?, ?, ?, ?)`
        ).run(`thr_s${i}`, clawIdA, 'tracking', `Thread ${s}`, s)
        const row = db
          .prepare('SELECT status FROM threads_v5 WHERE id = ?')
          .get(`thr_s${i}`) as { status: string }
        expect(row.status).toBe(s)
      })
    })

    it('should cascade delete when creator is deleted', () => {
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run('thr_del', clawIdA, 'tracking', 'Delete Test')
      db.prepare(`DELETE FROM claws WHERE claw_id = ?`).run(clawIdA)
      const row = db
        .prepare('SELECT id FROM threads_v5 WHERE id = ?')
        .get('thr_del')
      expect(row).toBeUndefined()
    })

    it('should have idx_threads_creator index', () => {
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_threads_creator'")
        .get()
      expect(idx).toBeTruthy()
    })

    it('should have idx_threads_status index', () => {
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_threads_status'")
        .get()
      expect(idx).toBeTruthy()
    })
  })

  // ─── thread_participants ────────────────────────────────────────────────────

  describe('thread_participants 表', () => {
    let threadId: string

    beforeEach(() => {
      threadId = 'thr_part'
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'coordination', 'Participant Test')
    })

    it('should create thread_participants table', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='thread_participants'")
        .get()
      expect(result).toBeTruthy()
    })

    it('should have all required columns', () => {
      const cols = db.prepare('PRAGMA table_info(thread_participants)').all() as Array<{ name: string }>
      const colNames = cols.map((c) => c.name)
      expect(colNames).toContain('thread_id')
      expect(colNames).toContain('claw_id')
      expect(colNames).toContain('joined_at')
    })

    it('should insert participant successfully', () => {
      db.prepare(
        `INSERT INTO thread_participants (thread_id, claw_id) VALUES (?, ?)`
      ).run(threadId, clawIdA)
      const row = db
        .prepare('SELECT claw_id FROM thread_participants WHERE thread_id = ? AND claw_id = ?')
        .get(threadId, clawIdA)
      expect(row).toBeTruthy()
    })

    it('should enforce PRIMARY KEY (thread_id, claw_id)', () => {
      db.prepare(
        `INSERT INTO thread_participants (thread_id, claw_id) VALUES (?, ?)`
      ).run(threadId, clawIdA)
      expect(() => {
        db.prepare(
          `INSERT INTO thread_participants (thread_id, claw_id) VALUES (?, ?)`
        ).run(threadId, clawIdA)
      }).toThrow()
    })

    it('should cascade delete when thread is deleted', () => {
      db.prepare(
        `INSERT INTO thread_participants (thread_id, claw_id) VALUES (?, ?)`
      ).run(threadId, clawIdA)
      db.prepare(`DELETE FROM threads_v5 WHERE id = ?`).run(threadId)
      const row = db
        .prepare('SELECT claw_id FROM thread_participants WHERE thread_id = ?')
        .get(threadId)
      expect(row).toBeUndefined()
    })

    it('should have idx_thread_participants_claw index', () => {
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_thread_participants_claw'")
        .get()
      expect(idx).toBeTruthy()
    })
  })

  // ─── thread_contributions ────────────────────────────────────────────────────

  describe('thread_contributions 表（E2EE）', () => {
    let threadId: string

    beforeEach(() => {
      threadId = 'thr_contrib'
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'debate', 'Contribution Test')
      db.prepare(
        `INSERT INTO thread_participants (thread_id, claw_id) VALUES (?, ?)`
      ).run(threadId, clawIdA)
    })

    it('should create thread_contributions table', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='thread_contributions'")
        .get()
      expect(result).toBeTruthy()
    })

    it('should have E2EE columns (encrypted_content + nonce, no content)', () => {
      const cols = db.prepare('PRAGMA table_info(thread_contributions)').all() as Array<{ name: string }>
      const colNames = cols.map((c) => c.name)
      expect(colNames).toContain('id')
      expect(colNames).toContain('thread_id')
      expect(colNames).toContain('contributor_id')
      expect(colNames).toContain('encrypted_content')
      expect(colNames).toContain('nonce')
      expect(colNames).toContain('content_type')
      expect(colNames).toContain('created_at')
      // 不应该有明文 content 字段
      expect(colNames).not.toContain('content')
    })

    it('should enforce content_type CHECK constraint', () => {
      expect(() => {
        db.prepare(
          `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('con_bad', threadId, clawIdA, 'encrypted_data', 'nonce_data', 'invalid_type')
      }).toThrow()
    })

    it('should accept all valid content_types', () => {
      const types = ['text', 'pearl_ref', 'link', 'reaction']
      types.forEach((t, i) => {
        expect(() => {
          db.prepare(
            `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(`con_${i}`, threadId, clawIdA, 'encrypted_data', `nonce_${i}`, t)
        }).not.toThrow()
      })
    })

    it('should cascade delete when thread is deleted', () => {
      db.prepare(
        `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('con_del', threadId, clawIdA, 'enc', 'nonce', 'text')
      db.prepare(`DELETE FROM threads_v5 WHERE id = ?`).run(threadId)
      const row = db
        .prepare('SELECT id FROM thread_contributions WHERE id = ?')
        .get('con_del')
      expect(row).toBeUndefined()
    })

    it('should have idx_contributions_thread index', () => {
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contributions_thread'")
        .get()
      expect(idx).toBeTruthy()
    })

    it('should have idx_contributions_contributor index', () => {
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contributions_contributor'")
        .get()
      expect(idx).toBeTruthy()
    })

    it('should enforce nonce uniqueness per thread (AES-256-GCM security)', () => {
      db.prepare(
        `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('con_n1', threadId, clawIdA, 'enc1', 'same_nonce', 'text')
      // 同一 thread 下 nonce 重用应当失败
      expect(() => {
        db.prepare(
          `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('con_n2', threadId, clawIdB, 'enc2', 'same_nonce', 'text')
      }).toThrow()
    })

    it('should allow same nonce in different threads', () => {
      const threadId2 = 'thr_contrib2'
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run(threadId2, clawIdA, 'tracking', 'Thread 2')
      db.prepare(
        `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('con_t1', threadId, clawIdA, 'enc1', 'shared_nonce', 'text')
      // 不同 thread 可以有相同的 nonce（不同密钥域）
      expect(() => {
        db.prepare(
          `INSERT INTO thread_contributions (id, thread_id, contributor_id, encrypted_content, nonce, content_type)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('con_t2', threadId2, clawIdA, 'enc2', 'shared_nonce', 'text')
      }).not.toThrow()
    })
  })

  // ─── thread_keys ────────────────────────────────────────────────────────────

  describe('thread_keys 表（E2EE 密钥份额）', () => {
    let threadId: string

    beforeEach(() => {
      threadId = 'thr_keys'
      db.prepare(
        `INSERT INTO threads_v5 (id, creator_id, purpose, title) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'creation', 'Keys Test')
    })

    it('should create thread_keys table', () => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='thread_keys'")
        .get()
      expect(result).toBeTruthy()
    })

    it('should have all required columns', () => {
      const cols = db.prepare('PRAGMA table_info(thread_keys)').all() as Array<{ name: string }>
      const colNames = cols.map((c) => c.name)
      expect(colNames).toContain('thread_id')
      expect(colNames).toContain('claw_id')
      expect(colNames).toContain('encrypted_key')
      expect(colNames).toContain('distributed_by')
      expect(colNames).toContain('created_at')
    })

    it('should insert thread key record successfully', () => {
      db.prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'encrypted_key_base64', clawIdA)
      const row = db
        .prepare('SELECT encrypted_key FROM thread_keys WHERE thread_id = ? AND claw_id = ?')
        .get(threadId, clawIdA)
      expect(row).toBeTruthy()
    })

    it('should enforce PRIMARY KEY (thread_id, claw_id)', () => {
      db.prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'key1', clawIdA)
      expect(() => {
        db.prepare(
          `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
        ).run(threadId, clawIdA, 'key2', clawIdA)
      }).toThrow()
    })

    it('should cascade delete when thread is deleted', () => {
      db.prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'key_to_delete', clawIdA)
      db.prepare(`DELETE FROM threads_v5 WHERE id = ?`).run(threadId)
      const row = db
        .prepare('SELECT claw_id FROM thread_keys WHERE thread_id = ?')
        .get(threadId)
      expect(row).toBeUndefined()
    })

    it('should allow multiple participants with different keys for same thread', () => {
      db.prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdA, 'key_a', clawIdA)
      db.prepare(
        `INSERT INTO thread_keys (thread_id, claw_id, encrypted_key, distributed_by) VALUES (?, ?, ?, ?)`
      ).run(threadId, clawIdB, 'key_b', clawIdA)
      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM thread_keys WHERE thread_id = ?')
        .get(threadId) as { cnt: number }
      expect(count.cnt).toBe(2)
    })
  })
})
