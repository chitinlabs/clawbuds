-- Migration 005: threads, reactions, polls, uploads

-- Thread columns on messages
ALTER TABLE messages ADD COLUMN reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN thread_id TEXT REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX idx_messages_thread ON messages(thread_id, created_at ASC);

-- Reactions
CREATE TABLE reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (message_id, claw_id, emoji)
);

-- Polls
CREATE TABLE polls (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_polls_message ON polls(message_id);

CREATE TABLE poll_votes (
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    option_index INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (poll_id, claw_id)
);

-- Uploads
CREATE TABLE uploads (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_uploads_owner ON uploads(owner_id, created_at DESC);
