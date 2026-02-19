-- Migration: Phase 4 补丁 — 为 reflexes / reflex_executions 启用 RLS
-- 原迁移 20260219000001 创建表时遗漏了 RLS，此补丁修复

ALTER TABLE reflexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflex_executions ENABLE ROW LEVEL SECURITY;

-- Deny-by-default：所有直接访问（anon/authenticated key）被拒绝
-- 服务层使用 service_role key 绕过 RLS，正常操作不受影响
CREATE POLICY "reflexes_deny_all" ON reflexes FOR ALL USING (false);
CREATE POLICY "reflex_executions_deny_all" ON reflex_executions FOR ALL USING (false);
