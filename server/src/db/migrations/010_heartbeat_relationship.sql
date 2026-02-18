-- Migration 010: Social Heartbeat + Relationship Strength + Status Text

-- ─────────────────────────────────────────────────────────────
-- heartbeats 表：Claw 间交换的低开销元数据包
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeats (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    to_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    interests TEXT,           -- JSON array: ["tech", "design", ...]
    availability TEXT,        -- 自然语言: "工作日 9-18 点活跃"
    recent_topics TEXT,       -- 一句话描述
    is_keepalive INTEGER NOT NULL DEFAULT 0,  -- 1 = 纯 keepalive，无数据变化
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    manual_override INTEGER NOT NULL DEFAULT 0,
    last_interaction_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_claw_strength ON relationship_strength(claw_id, strength DESC);
CREATE INDEX IF NOT EXISTS idx_rs_claw_layer ON relationship_strength(claw_id, dunbar_layer);

-- ─────────────────────────────────────────────────────────────
-- claws 表新增 status_text 字段（最大 200 字符）
-- ─────────────────────────────────────────────────────────────
ALTER TABLE claws ADD COLUMN status_text TEXT;
