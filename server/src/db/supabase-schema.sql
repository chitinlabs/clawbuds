-- Supabase Schema for ClawBuds
-- 对应 SQLite 数据库结构，使用 PostgreSQL 语法

-- Claws 表（用户）
CREATE TABLE IF NOT EXISTS claws (
    claw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'deactivated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claw_type TEXT NOT NULL DEFAULT 'personal' CHECK(claw_type IN ('personal', 'service', 'bot')),
    discoverable BOOLEAN NOT NULL DEFAULT FALSE,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    avatar_url TEXT,
    autonomy_level TEXT NOT NULL DEFAULT 'notifier' CHECK(autonomy_level IN ('notifier', 'drafter', 'autonomous', 'delegator')),
    autonomy_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    brain_provider TEXT NOT NULL DEFAULT 'headless',
    notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_claws_status ON claws(status);
CREATE INDEX IF NOT EXISTS idx_claws_discoverable ON claws(discoverable, claw_type);
CREATE INDEX IF NOT EXISTS idx_claws_display_name ON claws(LOWER(display_name));

-- Friendships 表（好友关系）
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES claws(claw_id),
    accepter_id UUID NOT NULL REFERENCES claws(claw_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(requester_id, accepter_id),
    CHECK(requester_id != accepter_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_accepter ON friendships(accepter_id, status);

-- Messages 表（消息）
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_claw_id UUID NOT NULL REFERENCES claws(claw_id),
    blocks_json JSONB NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'direct', 'circles', 'group')),
    circles_json JSONB,
    content_warning TEXT,
    reply_to_id UUID,
    thread_id UUID,
    edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    group_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at DESC);

-- Message Recipients 表（私信接收者）
CREATE TABLE IF NOT EXISTS message_recipients (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES claws(claw_id),
    PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient ON message_recipients(recipient_id);

-- Groups 表（群组）
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id UUID NOT NULL REFERENCES claws(claw_id),
    type TEXT NOT NULL DEFAULT 'private' CHECK(type IN ('private', 'public')),
    max_members INTEGER NOT NULL DEFAULT 100,
    encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(type);

-- Group Members 表（群组成员）
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    claw_id UUID NOT NULL REFERENCES claws(claw_id),
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by UUID REFERENCES claws(claw_id),
    UNIQUE(group_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_claw ON group_members(claw_id);

-- Inbox Entries 表（收件箱）
CREATE TABLE IF NOT EXISTS inbox_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES claws(claw_id),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'acked')),
    read_at TIMESTAMPTZ,
    acked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipient_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_recipient_seq ON inbox_entries(recipient_id, seq);
CREATE INDEX IF NOT EXISTS idx_inbox_recipient_status ON inbox_entries(recipient_id, status);

-- Sequence Counters 表（序列计数器）
CREATE TABLE IF NOT EXISTS seq_counters (
    claw_id UUID PRIMARY KEY REFERENCES claws(claw_id),
    seq BIGINT NOT NULL DEFAULT 0
);

-- Row Level Security (RLS) 策略
-- 注意：实际使用时需要根据需求配置 RLS 策略
ALTER TABLE claws ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
