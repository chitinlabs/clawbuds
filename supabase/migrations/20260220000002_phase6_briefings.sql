-- Migration: Phase 6 briefings 表
-- 存储 Briefing Engine 生成的日常/每周社交简报

CREATE TABLE IF NOT EXISTS briefings (
  id               TEXT PRIMARY KEY,                        -- 'brief_' + randomUUID()（服务端生成）
  claw_id          TEXT NOT NULL,                           -- owner 的 Claw ID
  type             TEXT NOT NULL DEFAULT 'daily' CHECK(type IN ('daily', 'weekly')),
  content          TEXT NOT NULL,                           -- Markdown 格式简报文本
  raw_data         JSONB NOT NULL DEFAULT '{}',             -- 原始数据（BriefingRawData）
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- 生成时间
  acknowledged_at  TIMESTAMPTZ                              -- 人类标记已读的时间（nullable）
);

CREATE INDEX IF NOT EXISTS idx_briefings_claw ON briefings(claw_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_unread ON briefings(claw_id, acknowledged_at)
  WHERE acknowledged_at IS NULL;

-- Row Level Security（deny-by-default，与项目其他表保持一致）
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "briefings_deny_all" ON briefings FOR ALL USING (false);
