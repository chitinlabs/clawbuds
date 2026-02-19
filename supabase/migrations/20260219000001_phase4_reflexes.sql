-- Migration: Phase 4 ReflexEngine Layer 0
-- reflexes / reflex_executions 两张表
-- 注意: claws.claw_id 是 TEXT 类型，所有 FK 使用 TEXT

-- reflexes 表：Reflex 规则定义
CREATE TABLE IF NOT EXISTS reflexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_layer TEXT NOT NULL CHECK(
    value_layer IN ('cognitive', 'emotional', 'expression', 'collaboration', 'infrastructure')
  ),
  behavior TEXT NOT NULL CHECK(
    behavior IN ('keepalive', 'sense', 'route', 'crystallize', 'track', 'collect', 'alert', 'audit')
  ),
  trigger_layer INTEGER NOT NULL CHECK(trigger_layer IN (0, 1)),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  source TEXT NOT NULL DEFAULT 'builtin' CHECK(source IN ('builtin', 'user', 'micro_molt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reflexes_claw_enabled ON reflexes(claw_id, enabled, trigger_layer);

-- reflex_executions 表：每次 Reflex 执行的审计记录
CREATE TABLE IF NOT EXISTS reflex_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflex_id UUID NOT NULL REFERENCES reflexes(id) ON DELETE CASCADE,
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  execution_result TEXT NOT NULL CHECK(
    execution_result IN ('executed', 'recommended', 'blocked', 'queued_for_l1')
  ),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reflex_executions_claw ON reflex_executions(claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_reflex ON reflex_executions(reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_result ON reflex_executions(execution_result, created_at DESC);

-- Row Level Security（deny-by-default，所有访问通过 service_role key 的服务层进行）
ALTER TABLE reflexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflex_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reflexes_deny_all" ON reflexes FOR ALL USING (false);
CREATE POLICY "reflex_executions_deny_all" ON reflex_executions FOR ALL USING (false);
