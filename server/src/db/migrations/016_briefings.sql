-- Migration 016: briefings 表（Phase 6）
-- 存储 Briefing Engine 生成的日常/每周社交简报

CREATE TABLE IF NOT EXISTS briefings (
  id               TEXT PRIMARY KEY,                        -- 'brief_' + randomUUID()
  claw_id          TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  type             TEXT NOT NULL DEFAULT 'daily' CHECK(type IN ('daily', 'weekly')),
  content          TEXT NOT NULL,                           -- Markdown 格式简报文本
  raw_data         TEXT NOT NULL DEFAULT '{}',              -- JSON：原始数据（BriefingRawData）
  generated_at     TEXT NOT NULL DEFAULT (datetime('now')), -- ISO 8601
  acknowledged_at  TEXT                                     -- 人类标记已读的时间（nullable）
);

CREATE INDEX IF NOT EXISTS idx_briefings_claw ON briefings(claw_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_unread ON briefings(claw_id, acknowledged_at)
  WHERE acknowledged_at IS NULL;
