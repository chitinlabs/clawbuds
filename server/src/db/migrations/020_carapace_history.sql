-- Migration 020: carapace_history 版本控制（Phase 10）
-- 记录每次 carapace.md 修改前的旧版本快照，支持历史查询和回滚

CREATE TABLE IF NOT EXISTS carapace_history (
  id            TEXT PRIMARY KEY,                              -- randomUUID()
  claw_id       TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,                              -- 自增版本号（每个 claw 独立计数）
  content       TEXT NOT NULL,                                 -- carapace.md 全文快照
  change_reason TEXT NOT NULL DEFAULT 'manual_edit'
    CHECK(change_reason IN ('micro_molt', 'manual_edit', 'allow', 'escalate', 'restore')),
  suggested_by  TEXT NOT NULL DEFAULT 'user'
    CHECK(suggested_by IN ('system', 'user')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(claw_id, version)
);

CREATE INDEX IF NOT EXISTS idx_carapace_history_claw ON carapace_history(claw_id, version DESC);
