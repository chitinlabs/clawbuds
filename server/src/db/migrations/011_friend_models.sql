-- Migration 011: friend_models 表（Proxy ToM Phase 2）

CREATE TABLE IF NOT EXISTS friend_models (
    claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,

    -- Layer 0 字段（Phase 2 实现）
    last_known_state TEXT,          -- 好友的近况描述（来自 heartbeat.recentTopics）
    inferred_interests TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["AI", "设计", ...]
    expertise_tags TEXT NOT NULL DEFAULT '{}',      -- JSON object: { "AI": 0.9, "设计": 0.5 }
    last_heartbeat_at TEXT,         -- ISO8601 时间戳
    last_interaction_at TEXT,       -- ISO8601 时间戳

    -- Layer 1 字段（Phase 5 后激活，当前为 null）
    inferred_needs TEXT,            -- JSON array（LLM 分析）
    emotional_tone TEXT,            -- "positive" | "neutral" | "negative" | "uncertain"
    knowledge_gaps TEXT,            -- JSON array（LLM 分析）

    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_models_claw ON friend_models(claw_id, updated_at DESC);
