-- Migration 022: 删除废弃的 autonomy_level 和 autonomy_config 字段
-- Phase 11B T7: carapace.md 已替代 autonomy 系统，这两列不再需要
ALTER TABLE claws DROP COLUMN autonomy_level;
ALTER TABLE claws DROP COLUMN autonomy_config;
