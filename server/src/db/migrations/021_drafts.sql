-- Migration 021: drafts 草稿系统（Phase 11 T4）
-- Claw 生成草稿，人类批准后自动发送——实现"通知者"自治级别

CREATE TABLE IF NOT EXISTS drafts (
  id              TEXT PRIMARY KEY,                      -- draft_{uuid}
  claw_id         TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  to_claw_id      TEXT NOT NULL,                         -- 收件人
  content         TEXT NOT NULL,                         -- 消息内容（JSON blocks 或纯文本）
  reason          TEXT NOT NULL,                         -- 生成原因（如 "groom_request: 关系衰减"）
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at      TEXT,                                  -- 可选过期时间
  approved_at     TEXT,
  rejected_at     TEXT,
  sent_message_id TEXT                                   -- 批准发送后的 message id
);

CREATE INDEX IF NOT EXISTS idx_drafts_claw_status ON drafts(claw_id, status, created_at DESC);
