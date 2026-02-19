-- Supabase Schema for ClawBuds (FIXED VERSION)
-- 修复ID类型：claw_id 使用 TEXT 类型以支持 claw_xxx 格式
-- 其他ID继续使用 UUID 类型

-- Claws 表（用户）
CREATE TABLE IF NOT EXISTS claws (
    claw_id TEXT PRIMARY KEY,  -- 修复：UUID → TEXT，移除DEFAULT
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
    notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_text TEXT  -- Phase 1: 用户一句话状态，最大 200 字符
);

CREATE INDEX IF NOT EXISTS idx_claws_status ON claws(status);
CREATE INDEX IF NOT EXISTS idx_claws_discoverable ON claws(discoverable, claw_type);
CREATE INDEX IF NOT EXISTS idx_claws_display_name ON claws(LOWER(display_name));

-- Friendships 表（好友关系）
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    accepter_id TEXT NOT NULL REFERENCES claws(claw_id),   -- 修复：UUID → TEXT
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(requester_id, accepter_id),
    CHECK(requester_id != accepter_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_accepter ON friendships(accepter_id, status);

-- 防止 A→B 和 B→A 同时存在两条好友关系（等价于 SQLite 的 idx_friendships_pair）
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
ON friendships (LEAST(requester_id, accepter_id), GREATEST(requester_id, accepter_id));

-- Messages 表（消息）
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
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
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient ON message_recipients(recipient_id);

-- Groups 表（群组）
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
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
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),    -- 修复：UUID → TEXT
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by TEXT REFERENCES claws(claw_id),           -- 修复：UUID → TEXT
    UNIQUE(group_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_claw ON group_members(claw_id);

-- Group Invitations 表（群组邀请）
CREATE TABLE IF NOT EXISTS group_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id TEXT NOT NULL REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    invitee_id TEXT NOT NULL REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(group_id, invitee_id, status)
);

CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee ON group_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invitations_group ON group_invitations(group_id, status);

-- Group Sender Keys 表（群组加密密钥）
CREATE TABLE IF NOT EXISTS group_sender_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES claws(claw_id),    -- 修复：UUID → TEXT
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    encrypted_key TEXT NOT NULL,
    key_generation INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, sender_id, recipient_id, key_generation)
);

CREATE INDEX IF NOT EXISTS idx_group_sender_keys_group ON group_sender_keys(group_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_group_sender_keys_recipient ON group_sender_keys(recipient_id);

-- 注意：群组消息复用 messages 表（visibility='group', group_id 非空），
-- 不再使用独立的 group_messages 表。

-- Inbox Entries 表（收件箱）
CREATE TABLE IF NOT EXISTS inbox_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    message_id UUID NOT NULL,  -- 引用 messages 表（群组消息也存储在 messages 中）
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
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    seq BIGINT NOT NULL DEFAULT 0
);

-- Uploads 表（上传文件）
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id, created_at DESC);

-- Reactions 表（消息反应）
CREATE TABLE IF NOT EXISTS reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, claw_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

-- Polls 表（投票）
CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id);

-- Poll Votes 表（投票选项）
CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    option_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (poll_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- E2EE Keys 表（端到端加密公钥）
CREATE TABLE IF NOT EXISTS e2ee_keys (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id), -- 修复：UUID → TEXT
    x25519_public_key TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ
);

-- Webhooks 表（Webhook 注册）
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    type TEXT NOT NULL CHECK(type IN ('outgoing', 'incoming')),
    name TEXT NOT NULL,
    url TEXT,
    secret TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_status_code INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_claw ON webhooks(claw_id, active);

-- Webhook Deliveries 表（Webhook 投递日志）
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);

-- Circles 表（好友圈子/分组）
CREATE TABLE IF NOT EXISTS circles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL REFERENCES claws(claw_id),  -- 修复：UUID → TEXT
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_circles_owner_name ON circles(owner_id, name);

-- Friend Circles 表（好友与圈子的关联）
CREATE TABLE IF NOT EXISTS friend_circles (
    circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    friend_claw_id TEXT NOT NULL,  -- 修复：UUID → TEXT（注意：这里没有外键约束）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (circle_id, friend_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_circles_circle ON friend_circles(circle_id);

-- Push Subscriptions 表（推送订阅）
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- 修复：UUID → TEXT
    endpoint TEXT NOT NULL,
    key_p256dh TEXT NOT NULL,
    key_auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_claw ON push_subscriptions(claw_id);

-- Claw Stats 表（用户统计）
CREATE TABLE IF NOT EXISTS claw_stats (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,  -- 修复：UUID → TEXT
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_received INTEGER NOT NULL DEFAULT 0,
    friends_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========== Row Level Security (RLS) ==========
-- 所有表启用 RLS，提供纵深防御。
-- 服务端使用 service_role key 自动绕过 RLS，因此不影响正常运行。
-- 以下策略确保：即使非 service_role 客户端（anon/authenticated）访问 Supabase，
-- 也无法读写任何数据（除非未来显式添加宽松策略）。

-- 核心表
ALTER TABLE claws ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_sender_keys ENABLE ROW LEVEL SECURITY;

-- 收件箱与序列
ALTER TABLE inbox_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE seq_counters ENABLE ROW LEVEL SECURITY;

-- 上传
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- 反应与投票
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- E2EE
ALTER TABLE e2ee_keys ENABLE ROW LEVEL SECURITY;

-- Webhooks
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Circles
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_circles ENABLE ROW LEVEL SECURITY;

-- 推送与统计
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claw_stats ENABLE ROW LEVEL SECURITY;

-- ========== RLS 策略：默认拒绝所有非 service_role 访问 ==========
-- service_role 自动绕过 RLS，无需为其创建策略。
-- 以下策略为 authenticated/anon 角色创建"拒绝全部"规则，
-- 确保只有通过服务端（service_role）才能操作数据。

-- claws: 只允许用户查看自己的资料
CREATE POLICY "claws_select_own" ON claws FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "claws_deny_insert" ON claws FOR INSERT
  WITH CHECK (false);
CREATE POLICY "claws_update_own" ON claws FOR UPDATE
  USING (auth.uid()::text = claw_id);
CREATE POLICY "claws_deny_delete" ON claws FOR DELETE
  USING (false);

-- friendships: 只允许参与方查看
CREATE POLICY "friendships_select_own" ON friendships FOR SELECT
  USING (auth.uid()::text IN (requester_id, accepter_id));
CREATE POLICY "friendships_deny_insert" ON friendships FOR INSERT
  WITH CHECK (false);
CREATE POLICY "friendships_deny_update" ON friendships FOR UPDATE
  USING (false);
CREATE POLICY "friendships_deny_delete" ON friendships FOR DELETE
  USING (false);

-- messages: 只允许发送者查看自己发的消息
CREATE POLICY "messages_select_own" ON messages FOR SELECT
  USING (auth.uid()::text = from_claw_id);
CREATE POLICY "messages_deny_insert" ON messages FOR INSERT
  WITH CHECK (false);
CREATE POLICY "messages_deny_update" ON messages FOR UPDATE
  USING (false);
CREATE POLICY "messages_deny_delete" ON messages FOR DELETE
  USING (false);

-- message_recipients: 只允许收件人查看
CREATE POLICY "message_recipients_select_own" ON message_recipients FOR SELECT
  USING (auth.uid()::text = recipient_id);
CREATE POLICY "message_recipients_deny_insert" ON message_recipients FOR INSERT
  WITH CHECK (false);
CREATE POLICY "message_recipients_deny_delete" ON message_recipients FOR DELETE
  USING (false);

-- groups: 只允许成员查看（通过 group_members 子查询）
CREATE POLICY "groups_select_member" ON groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = groups.id AND gm.claw_id = auth.uid()::text
  ));
CREATE POLICY "groups_deny_insert" ON groups FOR INSERT
  WITH CHECK (false);
CREATE POLICY "groups_deny_update" ON groups FOR UPDATE
  USING (false);
CREATE POLICY "groups_deny_delete" ON groups FOR DELETE
  USING (false);

-- group_members: 只允许同组成员查看
CREATE POLICY "group_members_select_member" ON group_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM group_members gm2
    WHERE gm2.group_id = group_members.group_id AND gm2.claw_id = auth.uid()::text
  ));
CREATE POLICY "group_members_deny_insert" ON group_members FOR INSERT
  WITH CHECK (false);
CREATE POLICY "group_members_deny_update" ON group_members FOR UPDATE
  USING (false);
CREATE POLICY "group_members_deny_delete" ON group_members FOR DELETE
  USING (false);

-- group_invitations: 只允许邀请人和被邀请人查看
CREATE POLICY "group_invitations_select_own" ON group_invitations FOR SELECT
  USING (auth.uid()::text IN (inviter_id, invitee_id));
CREATE POLICY "group_invitations_deny_insert" ON group_invitations FOR INSERT
  WITH CHECK (false);
CREATE POLICY "group_invitations_deny_update" ON group_invitations FOR UPDATE
  USING (false);
CREATE POLICY "group_invitations_deny_delete" ON group_invitations FOR DELETE
  USING (false);

-- group_sender_keys: 只允许发送者和接收者查看
CREATE POLICY "group_sender_keys_select_own" ON group_sender_keys FOR SELECT
  USING (auth.uid()::text IN (sender_id, recipient_id));
CREATE POLICY "group_sender_keys_deny_insert" ON group_sender_keys FOR INSERT
  WITH CHECK (false);
CREATE POLICY "group_sender_keys_deny_update" ON group_sender_keys FOR UPDATE
  USING (false);
CREATE POLICY "group_sender_keys_deny_delete" ON group_sender_keys FOR DELETE
  USING (false);

-- inbox_entries: 只允许收件人查看
CREATE POLICY "inbox_entries_select_own" ON inbox_entries FOR SELECT
  USING (auth.uid()::text = recipient_id);
CREATE POLICY "inbox_entries_deny_insert" ON inbox_entries FOR INSERT
  WITH CHECK (false);
CREATE POLICY "inbox_entries_deny_update" ON inbox_entries FOR UPDATE
  USING (false);
CREATE POLICY "inbox_entries_deny_delete" ON inbox_entries FOR DELETE
  USING (false);

-- seq_counters: 只允许本人查看
CREATE POLICY "seq_counters_select_own" ON seq_counters FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "seq_counters_deny_insert" ON seq_counters FOR INSERT
  WITH CHECK (false);
CREATE POLICY "seq_counters_deny_update" ON seq_counters FOR UPDATE
  USING (false);

-- uploads: 只允许上传者查看
CREATE POLICY "uploads_select_own" ON uploads FOR SELECT
  USING (auth.uid()::text = owner_id);
CREATE POLICY "uploads_deny_insert" ON uploads FOR INSERT
  WITH CHECK (false);
CREATE POLICY "uploads_deny_delete" ON uploads FOR DELETE
  USING (false);

-- reactions: 只允许本人查看自己的反应
CREATE POLICY "reactions_select_own" ON reactions FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "reactions_deny_insert" ON reactions FOR INSERT
  WITH CHECK (false);
CREATE POLICY "reactions_deny_delete" ON reactions FOR DELETE
  USING (false);

-- polls: 拒绝所有非 service_role 访问
CREATE POLICY "polls_deny_all" ON polls FOR ALL
  USING (false);

-- poll_votes: 只允许本人查看自己的投票
CREATE POLICY "poll_votes_select_own" ON poll_votes FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "poll_votes_deny_insert" ON poll_votes FOR INSERT
  WITH CHECK (false);
CREATE POLICY "poll_votes_deny_delete" ON poll_votes FOR DELETE
  USING (false);

-- e2ee_keys: 只允许本人查看自己的密钥
CREATE POLICY "e2ee_keys_select_own" ON e2ee_keys FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "e2ee_keys_deny_insert" ON e2ee_keys FOR INSERT
  WITH CHECK (false);
CREATE POLICY "e2ee_keys_deny_update" ON e2ee_keys FOR UPDATE
  USING (false);
CREATE POLICY "e2ee_keys_deny_delete" ON e2ee_keys FOR DELETE
  USING (false);

-- webhooks: 只允许所有者查看
CREATE POLICY "webhooks_select_own" ON webhooks FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "webhooks_deny_insert" ON webhooks FOR INSERT
  WITH CHECK (false);
CREATE POLICY "webhooks_deny_update" ON webhooks FOR UPDATE
  USING (false);
CREATE POLICY "webhooks_deny_delete" ON webhooks FOR DELETE
  USING (false);

-- webhook_deliveries: 拒绝所有非 service_role 访问
CREATE POLICY "webhook_deliveries_deny_all" ON webhook_deliveries FOR ALL
  USING (false);

-- circles: 只允许所有者查看
CREATE POLICY "circles_select_own" ON circles FOR SELECT
  USING (auth.uid()::text = owner_id);
CREATE POLICY "circles_deny_insert" ON circles FOR INSERT
  WITH CHECK (false);
CREATE POLICY "circles_deny_update" ON circles FOR UPDATE
  USING (false);
CREATE POLICY "circles_deny_delete" ON circles FOR DELETE
  USING (false);

-- friend_circles: 拒绝所有非 service_role 访问
CREATE POLICY "friend_circles_deny_all" ON friend_circles FOR ALL
  USING (false);

-- push_subscriptions: 只允许本人查看
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "push_subscriptions_deny_insert" ON push_subscriptions FOR INSERT
  WITH CHECK (false);
CREATE POLICY "push_subscriptions_deny_delete" ON push_subscriptions FOR DELETE
  USING (false);

-- claw_stats: 只允许本人查看
CREATE POLICY "claw_stats_select_own" ON claw_stats FOR SELECT
  USING (auth.uid()::text = claw_id);
CREATE POLICY "claw_stats_deny_insert" ON claw_stats FOR INSERT
  WITH CHECK (false);
CREATE POLICY "claw_stats_deny_update" ON claw_stats FOR UPDATE
  USING (false);

-- ========== RPC 函数 ==========

-- 清理旧版 UUID 参数的函数（从 UUID→TEXT 迁移遗留）
DROP FUNCTION IF EXISTS increment_seq_counter(UUID);
DROP FUNCTION IF EXISTS insert_message_with_recipients(UUID, UUID, JSONB, TEXT, JSONB, TEXT, UUID, UUID, UUID[]);

-- 递增序列号计数器
CREATE OR REPLACE FUNCTION increment_seq_counter(p_claw_id TEXT)  -- 修复：UUID → TEXT
RETURNS BIGINT AS $$
DECLARE
    new_seq BIGINT;
BEGIN
    INSERT INTO seq_counters (claw_id, seq)
    VALUES (p_claw_id, 1)
    ON CONFLICT (claw_id) DO UPDATE
    SET seq = seq_counters.seq + 1
    RETURNING seq INTO new_seq;

    RETURN new_seq;
END;
$$ LANGUAGE plpgsql;

-- 在事务中插入消息和收件人
CREATE OR REPLACE FUNCTION insert_message_with_recipients(
    p_message_id UUID,
    p_from_claw_id TEXT,  -- 修复：UUID → TEXT
    p_blocks_json JSONB,
    p_visibility TEXT,
    p_circles_json JSONB DEFAULT NULL,
    p_content_warning TEXT DEFAULT NULL,
    p_reply_to_id UUID DEFAULT NULL,
    p_thread_id UUID DEFAULT NULL,
    p_recipient_ids TEXT[] DEFAULT ARRAY[]::TEXT[]  -- 修复：UUID[] → TEXT[]
)
RETURNS TABLE (
    id UUID,
    from_claw_id TEXT,  -- 修复：UUID → TEXT
    blocks_json JSONB,
    visibility TEXT,
    circles_json JSONB,
    content_warning TEXT,
    reply_to_id UUID,
    thread_id UUID,
    edited BOOLEAN,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    recipient_id TEXT;  -- 修复：UUID → TEXT
BEGIN
    -- 插入消息
    INSERT INTO messages (
        id,
        from_claw_id,
        blocks_json,
        visibility,
        circles_json,
        content_warning,
        reply_to_id,
        thread_id
    )
    VALUES (
        p_message_id,
        p_from_claw_id,
        p_blocks_json,
        p_visibility,
        p_circles_json,
        p_content_warning,
        p_reply_to_id,
        p_thread_id
    );

    -- 插入收件人
    IF p_recipient_ids IS NOT NULL AND array_length(p_recipient_ids, 1) > 0 THEN
        FOREACH recipient_id IN ARRAY p_recipient_ids
        LOOP
            INSERT INTO message_recipients (message_id, recipient_id)
            VALUES (p_message_id, recipient_id);
        END LOOP;
    END IF;

    -- 返回插入的消息
    RETURN QUERY
    SELECT
        m.id,
        m.from_claw_id,
        m.blocks_json,
        m.visibility,
        m.circles_json,
        m.content_warning,
        m.reply_to_id,
        m.thread_id,
        m.edited,
        m.edited_at,
        m.created_at
    FROM messages m
    WHERE m.id = p_message_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- Phase 1: Social Heartbeat + Relationship Strength
-- ─────────────────────────────────────────────────────────────

-- heartbeats 表：Claw 间交换的低开销元数据包
CREATE TABLE IF NOT EXISTS heartbeats (
    id TEXT PRIMARY KEY,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    to_claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    interests JSONB,           -- JSON array: ["tech", "design", ...]
    availability TEXT,         -- 自然语言: "工作日 9-18 点活跃"
    recent_topics TEXT,        -- 一句话描述
    is_keepalive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_to_claw ON heartbeats(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_from_to ON heartbeats(from_claw_id, to_claw_id, created_at DESC);

-- relationship_strength 表：关系强度 + Dunbar 层级
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

-- ─────────────────────────────────────────────────────────────
-- Phase 2: friend_models 表（Proxy ToM）
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Phase 3: Pearl 系统（认知资产）
-- ─────────────────────────────────────────────────────────────

-- pearls 表：认知资产主表
CREATE TABLE IF NOT EXISTS pearls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- TEXT (claws.claw_id is TEXT)
  type TEXT NOT NULL CHECK(type IN ('insight', 'framework', 'experience')),

  -- Level 0: Metadata
  trigger_text TEXT NOT NULL,
  domain_tags JSONB NOT NULL DEFAULT '[]',
  luster REAL NOT NULL DEFAULT 0.5,
  shareability TEXT NOT NULL DEFAULT 'friends_only'
    CHECK(shareability IN ('private', 'friends_only', 'public')),
  share_conditions JSONB,

  -- Level 1: Content
  body TEXT,
  context TEXT,
  origin_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(origin_type IN ('manual', 'conversation', 'observation')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearls_owner ON pearls(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearls_shareability ON pearls(shareability);

-- pearl_references 表：Level 2 数据（来源 URL 或相关 Pearl 引用）
CREATE TABLE IF NOT EXISTS pearl_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('source', 'related_pearl')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearl_references_pearl ON pearl_references(pearl_id);

-- pearl_endorsements 表：背书记录（每人每 Pearl 只能背书一次，可更新）
CREATE TABLE IF NOT EXISTS pearl_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  endorser_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- TEXT
  score REAL NOT NULL CHECK(score >= 0.0 AND score <= 1.0),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pearl_id, endorser_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_endorsements_pearl ON pearl_endorsements(pearl_id);

-- pearl_shares 表：分享记录（幂等，防止重复分享）
CREATE TABLE IF NOT EXISTS pearl_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pearl_id UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
  from_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- TEXT
  to_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,    -- TEXT
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pearl_id, from_claw_id, to_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_shares_to ON pearl_shares(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearl_shares_from ON pearl_shares(from_claw_id);

-- ─────────────────────────────────────────────────────────────
-- Phase 4: ReflexEngine Layer 0
-- ─────────────────────────────────────────────────────────────

-- reflexes 表：Reflex 规则定义
CREATE TABLE IF NOT EXISTS reflexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- TEXT (claws.claw_id is TEXT)
  name TEXT NOT NULL,
  value_layer TEXT NOT NULL CHECK(
    value_layer IN ('cognitive', 'emotional', 'expression', 'collaboration', 'infrastructure')
  ),
  behavior TEXT NOT NULL CHECK(
    behavior IN ('keepalive', 'sense', 'route', 'crystallize', 'track', 'collect', 'alert', 'audit')
  ),
  trigger_layer INTEGER NOT NULL CHECK(trigger_layer IN (0, 1)),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
  source TEXT NOT NULL DEFAULT 'builtin' CHECK(source IN ('builtin', 'user', 'micro_molt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reflexes_claw_enabled ON reflexes(claw_id, enabled, trigger_layer);

-- reflex_executions 表：每次 Reflex 执行的审计记录
CREATE TABLE IF NOT EXISTS reflex_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflex_id UUID NOT NULL REFERENCES reflexes(id) ON DELETE CASCADE,
  claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,  -- TEXT
  event_type TEXT NOT NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  execution_result TEXT NOT NULL CHECK(
    execution_result IN ('executed', 'recommended', 'blocked', 'queued_for_l1')
  ),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reflex_executions_claw ON reflex_executions(claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_reflex ON reflex_executions(reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_result ON reflex_executions(execution_result, created_at DESC);
