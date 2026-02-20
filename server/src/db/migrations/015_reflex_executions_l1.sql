-- Migration 015: reflex_executions Phase 5 状态扩展
-- 新增 dispatched_to_l1 / l1_acknowledged 两个执行状态
-- SQLite 不支持 ALTER TABLE ... MODIFY CONSTRAINT，需要重建表

PRAGMA foreign_keys = OFF;

-- 1. 创建新表（含扩展的 CHECK 约束）
CREATE TABLE IF NOT EXISTS reflex_executions_new (
  id               TEXT PRIMARY KEY,
  reflex_id        TEXT NOT NULL REFERENCES reflexes(id) ON DELETE CASCADE,
  claw_id          TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  trigger_data     TEXT NOT NULL DEFAULT '{}',
  execution_result TEXT NOT NULL CHECK(execution_result IN (
                     'executed', 'recommended', 'blocked', 'queued_for_l1',
                     'dispatched_to_l1', 'l1_acknowledged'
                   )),
  details          TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 复制现有数据
INSERT INTO reflex_executions_new
  SELECT id, reflex_id, claw_id, event_type, trigger_data, execution_result, details, created_at
  FROM reflex_executions;

-- 3. 删除旧表
DROP TABLE reflex_executions;

-- 4. 重命名新表
ALTER TABLE reflex_executions_new RENAME TO reflex_executions;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_reflex_executions_claw ON reflex_executions(claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_reflex ON reflex_executions(reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_result ON reflex_executions(execution_result, created_at DESC);

PRAGMA foreign_keys = ON;
