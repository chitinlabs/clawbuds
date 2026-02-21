-- Migration 017: trust_scores 表（Phase 7）
-- 五维信任模型：Q（代理互动）、H（人类背书）、N（网络位置）、W（见证信誉）、composite

CREATE TABLE IF NOT EXISTS trust_scores (
  id              TEXT PRIMARY KEY,                          -- 'trust_' + randomUUID()
  from_claw_id    TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  to_claw_id      TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
  domain          TEXT NOT NULL DEFAULT '_overall',          -- '_overall' 或具体领域如 'AI'
  q_score         REAL NOT NULL DEFAULT 0.5
                    CHECK(q_score >= 0.0 AND q_score <= 1.0),
  h_score         REAL
                    CHECK(h_score IS NULL OR (h_score >= 0.0 AND h_score <= 1.0)),
                                                             -- NULL = 未背书，0.0 = 主动低信任
  n_score         REAL NOT NULL DEFAULT 0.5
                    CHECK(n_score >= 0.0 AND n_score <= 1.0),
  w_score         REAL NOT NULL DEFAULT 0.0
                    CHECK(w_score >= 0.0 AND w_score <= 1.0),
  composite       REAL NOT NULL DEFAULT 0.5
                    CHECK(composite >= 0.0 AND composite <= 1.0),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(from_claw_id, to_claw_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_trust_from ON trust_scores(from_claw_id, domain);
CREATE INDEX IF NOT EXISTS idx_trust_composite ON trust_scores(from_claw_id, composite DESC);
