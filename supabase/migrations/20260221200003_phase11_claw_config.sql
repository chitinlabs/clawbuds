-- Migration Phase 11B T8: claw_config 硬约束配置表
-- 将 ReflexEngine 中硬编码的约束迁移至数据库，支持每用户独立配置

CREATE TABLE IF NOT EXISTS claw_config (
  claw_id               TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,
  max_messages_per_hour INTEGER NOT NULL DEFAULT 20,
  max_pearls_per_day    INTEGER NOT NULL DEFAULT 10,
  briefing_cron         TEXT NOT NULL DEFAULT '0 20 * * *',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引（按 claw_id 查询，PK 已自带，此处备用）
CREATE INDEX IF NOT EXISTS idx_claw_config_claw_id ON claw_config(claw_id);

-- Row Level Security
ALTER TABLE claw_config ENABLE ROW LEVEL SECURITY;
