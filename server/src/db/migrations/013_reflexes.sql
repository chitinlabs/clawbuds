-- Migration 013: ReflexEngine 数据层（Phase 4）
-- reflexes / reflex_executions 两张表

CREATE TABLE IF NOT EXISTS reflexes (
  id TEXT PRIMARY KEY,
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_layer TEXT NOT NULL CHECK(
    value_layer IN ('cognitive', 'emotional', 'expression', 'collaboration', 'infrastructure')
  ),
  behavior TEXT NOT NULL CHECK(
    behavior IN ('keepalive', 'sense', 'route', 'crystallize', 'track', 'collect', 'alert', 'audit')
  ),
  trigger_layer INTEGER NOT NULL CHECK(trigger_layer IN (0, 1)),
  trigger_config TEXT NOT NULL DEFAULT '{}',   -- JSON object
  enabled INTEGER NOT NULL DEFAULT 1,          -- SQLite: 1=true, 0=false
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  source TEXT NOT NULL DEFAULT 'builtin' CHECK(source IN ('builtin', 'user', 'micro_molt')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reflexes_claw_enabled ON reflexes(claw_id, enabled, trigger_layer);

-- reflex_executions: 每次 Reflex 执行的审计记录
CREATE TABLE IF NOT EXISTS reflex_executions (
  id TEXT PRIMARY KEY,
  reflex_id TEXT NOT NULL REFERENCES reflexes(id) ON DELETE CASCADE,
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  trigger_data TEXT NOT NULL DEFAULT '{}',     -- JSON object：触发事件的数据快照
  execution_result TEXT NOT NULL CHECK(
    execution_result IN ('executed', 'recommended', 'blocked', 'queued_for_l1')
  ),
  details TEXT NOT NULL DEFAULT '{}',          -- JSON object：执行详情 / 警报内容 / 拦截原因
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reflex_executions_claw ON reflex_executions(claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_reflex ON reflex_executions(reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_result ON reflex_executions(execution_result, created_at DESC);
