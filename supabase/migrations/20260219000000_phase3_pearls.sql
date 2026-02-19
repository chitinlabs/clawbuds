-- Migration: Phase 3 Pearl 系统（认知资产）
-- pearls / pearl_references / pearl_endorsements / pearl_shares
-- 注意: claws.claw_id 是 TEXT 类型，所有 FK 使用 TEXT 不是 UUID

-- pearls 表：认知资产主表
CREATE TABLE IF NOT EXISTS pearls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('insight', 'framework', 'experience')),

  -- Level 0: Metadata
  trigger_text TEXT NOT NULL,
  domain_tags JSONB NOT NULL DEFAULT '[]',
  luster REAL NOT NULL DEFAULT 0.5,
  shareability TEXT NOT NULL DEFAULT 'friends_only'
    CHECK(shareability IN ('private', 'friends_only', 'public')),
  share_conditions JSONB,

  -- Level 1: Content
  body TEXT,
  context TEXT,
  origin_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(origin_type IN ('manual', 'conversation', 'observation')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearls_owner ON pearls(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearls_shareability ON pearls(shareability);

-- pearl_references 表：Level 2 数据（来源 URL 或相关 Pearl 引用）
CREATE TABLE IF NOT EXISTS pearl_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('source', 'related_pearl')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearl_references_pearl ON pearl_references(pearl_id);

-- pearl_endorsements 表：背书记录（每人每 Pearl 只能背书一次，可更新）
CREATE TABLE IF NOT EXISTS pearl_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  endorser_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK(score >= 0.0 AND score <= 1.0),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pearl_id, endorser_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_endorsements_pearl ON pearl_endorsements(pearl_id);

-- pearl_shares 表：分享记录（幂等，防止重复分享）
CREATE TABLE IF NOT EXISTS pearl_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  from_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  to_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pearl_id, from_claw_id, to_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_shares_to ON pearl_shares(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearl_shares_from ON pearl_shares(from_claw_id);
