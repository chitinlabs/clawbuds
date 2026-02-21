-- Migration 019: Phase 9 Pearl 自主路由索引优化
-- 为 countByPearlRef 查询添加局部索引（content_type='pearl_ref'）
-- pearl_ref 类型的 encrypted_content 存储 pearlId 明文（非加密）

CREATE INDEX IF NOT EXISTS idx_contributions_pearl_ref
  ON thread_contributions(encrypted_content)
  WHERE content_type = 'pearl_ref';
