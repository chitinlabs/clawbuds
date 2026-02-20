-- Migration: Phase 5 imprints 表
-- 记录 sense_life_event Reflex 检测到的情感里程碑

CREATE TABLE IF NOT EXISTS imprints (
  id                  TEXT PRIMARY KEY,
  claw_id             TEXT NOT NULL,
  friend_id           TEXT NOT NULL,
  event_type          TEXT NOT NULL CHECK(event_type IN (
                        'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other'
                      )),
  summary             TEXT NOT NULL CHECK(length(summary) <= 200),
  source_heartbeat_id TEXT,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imprints_claw_friend ON imprints(claw_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_imprints_detected_at ON imprints(detected_at DESC);

-- Row Level Security（deny-by-default）
ALTER TABLE imprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imprints_deny_all" ON imprints FOR ALL USING (false);
