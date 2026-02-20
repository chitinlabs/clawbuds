-- Migration 014: imprints 表（Phase 5）
-- 记录 sense_life_event Reflex 检测到的情感里程碑

CREATE TABLE IF NOT EXISTS imprints (
  id                  TEXT PRIMARY KEY,           -- 'imp_' + nanoid(10)
  claw_id             TEXT NOT NULL,              -- owner 的 Claw ID
  friend_id           TEXT NOT NULL,              -- 触发事件的好友
  event_type          TEXT NOT NULL CHECK(event_type IN (
                        'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other'
                      )),
  summary             TEXT NOT NULL CHECK(length(summary) <= 200),  -- ≤ 200 字符
  source_heartbeat_id TEXT,                       -- 触发此 Imprint 的 heartbeat 记录 ID（可空）
  detected_at         TEXT NOT NULL DEFAULT (datetime('now'))  -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_imprints_claw_friend ON imprints(claw_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_imprints_detected_at ON imprints(detected_at DESC);
