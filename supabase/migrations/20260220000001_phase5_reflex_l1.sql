-- Migration: Phase 5 reflex_executions 状态扩展
-- 新增 dispatched_to_l1 / l1_acknowledged 两个执行状态

ALTER TABLE reflex_executions
  DROP CONSTRAINT IF EXISTS reflex_executions_execution_result_check;

ALTER TABLE reflex_executions
  ADD CONSTRAINT reflex_executions_execution_result_check
  CHECK (execution_result IN (
    'executed', 'recommended', 'blocked', 'queued_for_l1',
    'dispatched_to_l1', 'l1_acknowledged'
  ));
