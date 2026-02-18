-- Phase 2: friend_models 表（Proxy ToM）
-- 对应 SQLite migration: 011_friend_models.sql

CREATE TABLE IF NOT EXISTS friend_models (
    claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,

    -- Layer 0 字段（Phase 2 实现）
    last_known_state TEXT,
    inferred_interests JSONB NOT NULL DEFAULT '[]',
    expertise_tags JSONB NOT NULL DEFAULT '{}',
    last_heartbeat_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ,

    -- Layer 1 字段（Phase 5 后激活，当前为 null）
    inferred_needs JSONB,
    emotional_tone TEXT,
    knowledge_gaps JSONB,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_models_claw ON friend_models(claw_id, updated_at DESC);
