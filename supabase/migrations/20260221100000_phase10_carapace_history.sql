-- Migration: Phase 10 carapace_history 版本控制
-- 记录每次 carapace.md 修改前的旧版本快照，支持历史查询和回滚
-- 注意: claws.claw_id 是 TEXT 类型，claw_id FK 使用 TEXT 不是 UUID

CREATE TABLE IF NOT EXISTS carapace_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claw_id       TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  content       TEXT NOT NULL,
  change_reason TEXT NOT NULL DEFAULT 'manual_edit'
    CHECK(change_reason IN ('micro_molt', 'manual_edit', 'allow', 'escalate', 'restore')),
  suggested_by  TEXT NOT NULL DEFAULT 'user'
    CHECK(suggested_by IN ('system', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claw_id, version)
);

CREATE INDEX IF NOT EXISTS idx_carapace_history_claw ON carapace_history(claw_id, version DESC);

ALTER TABLE carapace_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carapace_history_deny_all" ON carapace_history FOR ALL USING (false);
