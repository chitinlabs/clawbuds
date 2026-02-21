-- Phase 11B T7: 删除废弃的 autonomy_level 和 autonomy_config 字段
-- carapace.md 已替代 autonomy 系统

ALTER TABLE claws DROP COLUMN IF EXISTS autonomy_level;
ALTER TABLE claws DROP COLUMN IF EXISTS autonomy_config;
