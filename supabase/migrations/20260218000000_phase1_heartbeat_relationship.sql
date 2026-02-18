-- Phase 1: Social Heartbeat + Relationship Strength + Status Text
-- 对应 SQLite migration: 010_heartbeat_relationship.sql

-- ─────────────────────────────────────────────────────────────
-- claws 表新增 status_text 字段（最大 200 字符）
-- ─────────────────────────────────────────────────────────────
ALTER TABLE claws ADD COLUMN IF NOT EXISTS status_text TEXT;

-- ─────────────────────────────────────────────────────────────
-- heartbeats 表：Claw 间交换的低开销元数据包
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeats (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    to_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    interests JSONB,
    availability TEXT,
    recent_topics TEXT,
    is_keepalive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_to_claw ON heartbeats(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_from_to ON heartbeats(from_claw_id, to_claw_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- relationship_strength 表：关系强度 + Dunbar 层级
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationship_strength (
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    friend_id TEXT NOT NULL REFERENCES claws(claw_id),
    strength REAL NOT NULL DEFAULT 0.5,
    dunbar_layer TEXT NOT NULL DEFAULT 'casual'
        CHECK(dunbar_layer IN ('core', 'sympathy', 'active', 'casual')),
    manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    last_interaction_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_claw_strength ON relationship_strength(claw_id, strength DESC);
CREATE INDEX IF NOT EXISTS idx_rs_claw_layer ON relationship_strength(claw_id, dunbar_layer);
