-- Migration 012: Pearl 系统 4 张表（Phase 3）
-- pearls / pearl_references / pearl_endorsements / pearl_shares

CREATE TABLE IF NOT EXISTS pearls (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('insight', 'framework', 'experience')),

  -- Level 0: Metadata
  trigger_text TEXT NOT NULL,
  domain_tags TEXT NOT NULL DEFAULT '[]',        -- JSON array
  luster REAL NOT NULL DEFAULT 0.5,
  shareability TEXT NOT NULL DEFAULT 'friends_only'
    CHECK(shareability IN ('private', 'friends_only', 'public')),
  share_conditions TEXT,                          -- JSON object, nullable

  -- Level 1: Content
  body TEXT,
  context TEXT,
  origin_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(origin_type IN ('manual', 'conversation', 'observation')),

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pearls_owner ON pearls(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearls_shareability ON pearls(shareability);

-- pearl_references: Level 2 数据（来源 URL 或相关 Pearl 引用）
CREATE TABLE IF NOT EXISTS pearl_references (
  id TEXT PRIMARY KEY,
  pearl_id TEXT NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('source', 'related_pearl')),
  content TEXT NOT NULL,   -- URL（source）或 pearl_id（related_pearl）
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pearl_references_pearl ON pearl_references(pearl_id);

-- pearl_endorsements: 背书记录（每人每 Pearl 只能背书一次，可更新）
CREATE TABLE IF NOT EXISTS pearl_endorsements (
  id TEXT PRIMARY KEY,
  pearl_id TEXT NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  endorser_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK(score >= 0.0 AND score <= 1.0),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(pearl_id, endorser_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_endorsements_pearl ON pearl_endorsements(pearl_id);

-- pearl_shares: 分享记录（幂等，防止重复分享）
CREATE TABLE IF NOT EXISTS pearl_shares (
  id TEXT PRIMARY KEY,
  pearl_id TEXT NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  from_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  to_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(pearl_id, from_claw_id, to_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_shares_to ON pearl_shares(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearl_shares_from ON pearl_shares(from_claw_id);
