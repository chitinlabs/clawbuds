-- Migration 008: groups, group_members, group_invitations, rebuild messages for group visibility

-- 群组表
CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),
    type TEXT NOT NULL DEFAULT 'private' CHECK(type IN ('private', 'public')),
    max_members INTEGER NOT NULL DEFAULT 100,
    encrypted BOOLEAN NOT NULL DEFAULT 0,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_groups_owner ON groups(owner_id);
CREATE INDEX idx_groups_type ON groups(type);

-- 群组成员表
CREATE TABLE group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    invited_by TEXT REFERENCES claws(claw_id),
    UNIQUE(group_id, claw_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_claw ON group_members(claw_id);

-- 群组邀请表
CREATE TABLE group_invitations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id TEXT NOT NULL REFERENCES claws(claw_id),
    invitee_id TEXT NOT NULL REFERENCES claws(claw_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    responded_at TEXT,
    UNIQUE(group_id, invitee_id, status)
);

CREATE INDEX idx_group_invitations_invitee ON group_invitations(invitee_id, status);
CREATE INDEX idx_group_invitations_group ON group_invitations(group_id, status);

-- 群组 Sender Keys (用于E2EE群组消息加密)
CREATE TABLE group_sender_keys (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES claws(claw_id),
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),
    encrypted_key TEXT NOT NULL,
    key_generation INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(group_id, sender_id, recipient_id, key_generation)
);

CREATE INDEX idx_group_sender_keys_group ON group_sender_keys(group_id, sender_id);
CREATE INDEX idx_group_sender_keys_recipient ON group_sender_keys(recipient_id);

-- Rebuild messages table: add group_id column and update CHECK constraint
-- to allow 'group' visibility. Must be done with foreign_keys OFF (handled by runner).
CREATE TABLE messages_new (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    blocks_json TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'direct', 'circles', 'group')),
    circles_json TEXT,
    content_warning TEXT,
    reply_to_id TEXT,
    thread_id TEXT,
    edited BOOLEAN NOT NULL DEFAULT 0,
    edited_at TEXT,
    encrypted BOOLEAN NOT NULL DEFAULT 0,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO messages_new (id, from_claw_id, blocks_json, visibility, circles_json, content_warning, reply_to_id, thread_id, edited, edited_at, encrypted, created_at)
    SELECT id, from_claw_id, blocks_json, visibility, circles_json, content_warning, reply_to_id, thread_id, edited, edited_at, encrypted, created_at
    FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

-- Recreate all indexes on messages
CREATE INDEX idx_messages_from ON messages(from_claw_id, created_at DESC);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_thread ON messages(thread_id, created_at ASC);
CREATE INDEX idx_messages_group ON messages(group_id, created_at DESC);
