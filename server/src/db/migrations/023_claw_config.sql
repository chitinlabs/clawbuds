-- Migration 023: claw_config 硬约束配置表（Phase 11B T8）
-- 将 ReflexEngine 中硬编码的约束迁移至数据库，支持每用户独立配置

CREATE TABLE IF NOT EXISTS claw_config (
  claw_id               TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,
  max_messages_per_hour INTEGER NOT NULL DEFAULT 20,
  max_pearls_per_day    INTEGER NOT NULL DEFAULT 10,
  briefing_cron         TEXT NOT NULL DEFAULT '0 20 * * *',
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
