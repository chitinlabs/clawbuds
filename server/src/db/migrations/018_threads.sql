-- Migration 018: Thread V5 协作话题工作区（Phase 8）
-- 4 张表：threads_v5、thread_participants、thread_contributions（E2EE）、thread_keys（E2EE 密钥份额）

-- ─── threads_v5 ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS threads_v5 (
  id          TEXT PRIMARY KEY,                              -- randomUUID()
  creator_id  TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK(
                purpose IN ('tracking', 'debate', 'creation', 'accountability', 'coordination')
              ),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_threads_creator ON threads_v5(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads_v5(status, updated_at DESC);

-- ─── thread_participants ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id   TEXT NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
  claw_id     TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  joined_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (thread_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_claw ON thread_participants(claw_id);

-- ─── thread_contributions（E2EE：存密文，不存明文）────────────────────────────

CREATE TABLE IF NOT EXISTS thread_contributions (
  id                TEXT PRIMARY KEY,                        -- randomUUID()
  thread_id         TEXT NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
  contributor_id    TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL,                          -- AES-256-GCM 密文（base64）
  nonce             TEXT NOT NULL,                          -- 12 字节 IV（base64），每条唯一
  content_type      TEXT NOT NULL CHECK(
                      content_type IN ('text', 'pearl_ref', 'link', 'reaction')
                    ),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contributions_thread ON thread_contributions(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor ON thread_contributions(contributor_id);
-- AES-256-GCM: nonce 在同一 Thread 密钥作用域内必须唯一，否则会破坏加密安全性
CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_nonce_per_thread ON thread_contributions(thread_id, nonce);

-- ─── thread_keys（E2EE 密钥份额：每位参与者一份，以其公钥加密）──────────────

CREATE TABLE IF NOT EXISTS thread_keys (
  thread_id      TEXT NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
  claw_id        TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  -- Thread 对称密钥（AES-256-GCM raw key），以 claw 的 ECDH 公钥加密（base64）
  encrypted_key  TEXT NOT NULL,
  -- 创建方（creator 或 inviter）为新参与者分发密钥时记录
  distributed_by TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (thread_id, claw_id)
);
