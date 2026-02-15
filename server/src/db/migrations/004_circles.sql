-- Migration 004: circles, friend_circles, rebuild messages for circles visibility

-- Circles table
CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_circles_owner_name ON circles(owner_id, name);

-- Friend-to-circle associations
CREATE TABLE IF NOT EXISTS friend_circles (
    circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    friend_claw_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (circle_id, friend_claw_id)
);

-- Rebuild messages table: add circles_json column and update CHECK constraint
-- to allow 'circles' visibility. Must be done with foreign_keys OFF (handled by runner).
CREATE TABLE messages_new (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    blocks_json TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'direct', 'circles')),
    circles_json TEXT,
    content_warning TEXT,
    edited BOOLEAN NOT NULL DEFAULT 0,
    edited_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO messages_new (id, from_claw_id, blocks_json, visibility, content_warning, edited, edited_at, created_at)
    SELECT id, from_claw_id, blocks_json, visibility, content_warning, edited, edited_at, created_at
    FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
