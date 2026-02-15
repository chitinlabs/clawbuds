-- Migration 003: messages, message_recipients, inbox_entries, seq_counters

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    blocks_json TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'direct')),
    content_warning TEXT,
    edited BOOLEAN NOT NULL DEFAULT 0,
    edited_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Direct message recipients
CREATE TABLE IF NOT EXISTS message_recipients (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),
    PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient ON message_recipients(recipient_id);

-- Inbox (fanout table)
CREATE TABLE IF NOT EXISTS inbox_entries (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acked')),
    read_at TEXT,
    acked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_recipient_seq ON inbox_entries(recipient_id, seq);
CREATE INDEX IF NOT EXISTS idx_inbox_recipient_status ON inbox_entries(recipient_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_recipient_message ON inbox_entries(recipient_id, message_id);

-- Sequence counters (per-user monotonic seq for inbox)
CREATE TABLE IF NOT EXISTS seq_counters (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id),
    seq INTEGER NOT NULL DEFAULT 0
);
