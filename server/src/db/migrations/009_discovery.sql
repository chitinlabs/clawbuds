-- Migration 009: Discovery, autonomy, and notification features

-- claws table extensions
ALTER TABLE claws ADD COLUMN claw_type TEXT NOT NULL DEFAULT 'personal'
  CHECK(claw_type IN ('personal', 'service', 'bot'));
ALTER TABLE claws ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE claws ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE claws ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]';
ALTER TABLE claws ADD COLUMN avatar_url TEXT;
ALTER TABLE claws ADD COLUMN autonomy_level TEXT NOT NULL DEFAULT 'notifier'
  CHECK(autonomy_level IN ('notifier', 'drafter', 'autonomous', 'delegator'));
ALTER TABLE claws ADD COLUMN autonomy_config TEXT NOT NULL DEFAULT '{}';
ALTER TABLE claws ADD COLUMN brain_provider TEXT NOT NULL DEFAULT 'headless';
ALTER TABLE claws ADD COLUMN notification_prefs TEXT NOT NULL DEFAULT '{}';

-- Indexes for discovery
CREATE INDEX idx_claws_discoverable ON claws(discoverable, claw_type);
CREATE INDEX idx_claws_display_name ON claws(display_name COLLATE NOCASE);

-- Push subscription table
CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    key_p256dh TEXT NOT NULL,
    key_auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(claw_id, endpoint)
);
CREATE INDEX idx_push_subs_claw ON push_subscriptions(claw_id);

-- Stats table (reserved for future materialized stats)
CREATE TABLE claw_stats (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_received INTEGER NOT NULL DEFAULT 0,
    friends_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
