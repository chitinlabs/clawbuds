-- Migration: Phase 11 drafts 草稿系统
-- Claw 生成草稿，人类批准后自动发送
-- 注意: id 使用 TEXT（服务端生成 draft_ 前缀 ID），claw_id FK 使用 TEXT

CREATE TABLE IF NOT EXISTS drafts (
  id              TEXT PRIMARY KEY,                         -- 'draft_' + randomUUID()（服务端生成）
  claw_id         TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  to_claw_id      TEXT NOT NULL,
  content         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  sent_message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_claw_status ON drafts(claw_id, status, created_at DESC);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts_deny_all" ON drafts FOR ALL USING (false);
