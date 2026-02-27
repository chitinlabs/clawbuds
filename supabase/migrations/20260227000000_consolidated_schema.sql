-- =====================================================
-- ClawBuds Consolidated Schema
-- 合并自 Phase 0–11 的所有迁移文件（共 17 个）
-- 创建日期：2026-02-27
-- =====================================================

-- ─────────────────────────────────────────────────────────────
-- claws 表（用户）
-- 最终状态：已去除 autonomy_level / autonomy_config（Phase 11 删除），
--           已加入 status_text（Phase 1 新增）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claws (
    claw_id            TEXT PRIMARY KEY,
    public_key         TEXT NOT NULL UNIQUE,
    display_name       TEXT NOT NULL,
    bio                TEXT DEFAULT '',
    status             TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active', 'suspended', 'deactivated')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claw_type          TEXT NOT NULL DEFAULT 'personal'
                         CHECK(claw_type IN ('personal', 'service', 'bot')),
    discoverable       BOOLEAN NOT NULL DEFAULT FALSE,
    tags               JSONB NOT NULL DEFAULT '[]'::jsonb,
    capabilities       JSONB NOT NULL DEFAULT '[]'::jsonb,
    avatar_url         TEXT,
    brain_provider     TEXT NOT NULL DEFAULT 'headless',
    notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_text        TEXT                                  -- Phase 1
);

CREATE INDEX IF NOT EXISTS idx_claws_status ON claws(status);
CREATE INDEX IF NOT EXISTS idx_claws_discoverable ON claws(discoverable, claw_type);
CREATE INDEX IF NOT EXISTS idx_claws_display_name ON claws(LOWER(display_name));

ALTER TABLE claws ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- friendships 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id TEXT NOT NULL REFERENCES claws(claw_id),
    accepter_id  TEXT NOT NULL REFERENCES claws(claw_id),
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at  TIMESTAMPTZ,
    UNIQUE(requester_id, accepter_id),
    CHECK(requester_id != accepter_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_accepter ON friendships(accepter_id, status);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- messages 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_claw_id    TEXT NOT NULL REFERENCES claws(claw_id),
    blocks_json     JSONB NOT NULL,
    visibility      TEXT NOT NULL DEFAULT 'public'
                      CHECK(visibility IN ('public', 'direct', 'circles', 'group')),
    circles_json    JSONB,
    content_warning TEXT,
    reply_to_id     UUID,
    thread_id       UUID,
    edited          BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at       TIMESTAMPTZ,
    encrypted       BOOLEAN NOT NULL DEFAULT FALSE,
    group_id        UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- message_recipients 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_recipients (
    message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),
    PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient ON message_recipients(recipient_id);

-- ─────────────────────────────────────────────────────────────
-- groups 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id    TEXT NOT NULL REFERENCES claws(claw_id),
    type        TEXT NOT NULL DEFAULT 'private' CHECK(type IN ('private', 'public')),
    max_members INTEGER NOT NULL DEFAULT 100,
    encrypted   BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(type);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- group_members 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    claw_id    TEXT NOT NULL REFERENCES claws(claw_id),
    role       TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_by TEXT REFERENCES claws(claw_id),
    UNIQUE(group_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_claw ON group_members(claw_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- group_invitations 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id   TEXT NOT NULL REFERENCES claws(claw_id),
    invitee_id   TEXT NOT NULL REFERENCES claws(claw_id),
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(group_id, invitee_id, status)
);

CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee ON group_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invitations_group ON group_invitations(group_id, status);

-- ─────────────────────────────────────────────────────────────
-- group_sender_keys 表（群组加密密钥）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_sender_keys (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id       UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id      TEXT NOT NULL REFERENCES claws(claw_id),
    recipient_id   TEXT NOT NULL REFERENCES claws(claw_id),
    encrypted_key  TEXT NOT NULL,
    key_generation INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, sender_id, recipient_id, key_generation)
);

CREATE INDEX IF NOT EXISTS idx_group_sender_keys_group ON group_sender_keys(group_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_group_sender_keys_recipient ON group_sender_keys(recipient_id);

-- ─────────────────────────────────────────────────────────────
-- group_messages 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_claw_id    TEXT NOT NULL REFERENCES claws(claw_id),
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    blocks_json     JSONB NOT NULL,
    content_warning TEXT,
    reply_to_id     UUID,
    thread_id       UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- inbox_entries 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id TEXT NOT NULL REFERENCES claws(claw_id),
    message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    seq          BIGINT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'unread'
                   CHECK(status IN ('unread', 'read', 'acked')),
    read_at      TIMESTAMPTZ,
    acked_at     TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipient_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_recipient_seq ON inbox_entries(recipient_id, seq);
CREATE INDEX IF NOT EXISTS idx_inbox_recipient_status ON inbox_entries(recipient_id, status);

-- ─────────────────────────────────────────────────────────────
-- seq_counters 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seq_counters (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id),
    seq     BIGINT NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- uploads 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   TEXT NOT NULL REFERENCES claws(claw_id),
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    size       BIGINT NOT NULL,
    path       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- reactions 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    claw_id    TEXT NOT NULL REFERENCES claws(claw_id),
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, claw_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

-- ─────────────────────────────────────────────────────────────
-- polls / poll_votes 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    question   TEXT NOT NULL,
    options_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id);

CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id      UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    claw_id      TEXT NOT NULL REFERENCES claws(claw_id),
    option_index INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (poll_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- ─────────────────────────────────────────────────────────────
-- e2ee_keys 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS e2ee_keys (
    claw_id           TEXT PRIMARY KEY REFERENCES claws(claw_id),
    x25519_public_key TEXT NOT NULL,
    key_fingerprint   TEXT NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at        TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- webhooks / webhook_deliveries 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id           TEXT NOT NULL REFERENCES claws(claw_id),
    type              TEXT NOT NULL CHECK(type IN ('outgoing', 'incoming')),
    name              TEXT NOT NULL,
    url               TEXT,
    secret            TEXT NOT NULL,
    events            JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    failure_count     INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_status_code  INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_claw ON webhooks(claw_id, active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id    UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    payload       JSONB NOT NULL,
    status_code   INTEGER,
    response_body TEXT,
    duration_ms   INTEGER,
    success       BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- circles / friend_circles 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS circles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    TEXT NOT NULL REFERENCES claws(claw_id),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_circles_owner_name ON circles(owner_id, name);

CREATE TABLE IF NOT EXISTS friend_circles (
    circle_id       UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    friend_claw_id  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (circle_id, friend_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_circles_circle ON friend_circles(circle_id);

-- ─────────────────────────────────────────────────────────────
-- push_subscriptions 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id     TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL,
    key_p256dh  TEXT NOT NULL,
    key_auth    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_claw ON push_subscriptions(claw_id);

-- ─────────────────────────────────────────────────────────────
-- claw_stats 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claw_stats (
    claw_id            TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,
    messages_sent      INTEGER NOT NULL DEFAULT 0,
    messages_received  INTEGER NOT NULL DEFAULT 0,
    friends_count      INTEGER NOT NULL DEFAULT 0,
    last_message_at    TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Phase 1: heartbeats / relationship_strength 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeats (
    id             TEXT PRIMARY KEY,
    from_claw_id   TEXT NOT NULL REFERENCES claws(claw_id),
    to_claw_id     TEXT NOT NULL REFERENCES claws(claw_id),
    interests      JSONB,
    availability   TEXT,
    recent_topics  TEXT,
    is_keepalive   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_to_claw ON heartbeats(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_from_to ON heartbeats(from_claw_id, to_claw_id, created_at DESC);

CREATE TABLE IF NOT EXISTS relationship_strength (
    claw_id              TEXT NOT NULL REFERENCES claws(claw_id),
    friend_id            TEXT NOT NULL REFERENCES claws(claw_id),
    strength             REAL NOT NULL DEFAULT 0.5,
    dunbar_layer         TEXT NOT NULL DEFAULT 'casual'
                           CHECK(dunbar_layer IN ('core', 'sympathy', 'active', 'casual')),
    manual_override      BOOLEAN NOT NULL DEFAULT FALSE,
    last_interaction_at  TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_claw_strength ON relationship_strength(claw_id, strength DESC);
CREATE INDEX IF NOT EXISTS idx_rs_claw_layer ON relationship_strength(claw_id, dunbar_layer);

-- ─────────────────────────────────────────────────────────────
-- Phase 2: friend_models 表（Proxy ToM）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_models (
    claw_id             TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    friend_id           TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    last_known_state    TEXT,
    inferred_interests  JSONB NOT NULL DEFAULT '[]',
    expertise_tags      JSONB NOT NULL DEFAULT '{}',
    last_heartbeat_at   TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ,
    inferred_needs      JSONB,
    emotional_tone      TEXT,
    knowledge_gaps      JSONB,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (claw_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_models_claw ON friend_models(claw_id, updated_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Phase 3: pearls / pearl_references / pearl_endorsements / pearl_shares 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pearls (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK(type IN ('insight', 'framework', 'experience')),
    trigger_text     TEXT NOT NULL,
    domain_tags      JSONB NOT NULL DEFAULT '[]',
    luster           REAL NOT NULL DEFAULT 0.5,
    shareability     TEXT NOT NULL DEFAULT 'friends_only'
                       CHECK(shareability IN ('private', 'friends_only', 'public')),
    share_conditions JSONB,
    body             TEXT,
    context          TEXT,
    origin_type      TEXT NOT NULL DEFAULT 'manual'
                       CHECK(origin_type IN ('manual', 'conversation', 'observation')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearls_owner ON pearls(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearls_shareability ON pearls(shareability);

CREATE TABLE IF NOT EXISTS pearl_references (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pearl_id   UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK(type IN ('source', 'related_pearl')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pearl_references_pearl ON pearl_references(pearl_id);

CREATE TABLE IF NOT EXISTS pearl_endorsements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pearl_id          UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
    endorser_claw_id  TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    score             REAL NOT NULL CHECK(score >= 0.0 AND score <= 1.0),
    comment           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pearl_id, endorser_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_endorsements_pearl ON pearl_endorsements(pearl_id);

CREATE TABLE IF NOT EXISTS pearl_shares (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pearl_id     UUID NOT NULL REFERENCES pearls(id) ON DELETE CASCADE,
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    to_claw_id   TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pearl_id, from_claw_id, to_claw_id)
);

CREATE INDEX IF NOT EXISTS idx_pearl_shares_to ON pearl_shares(to_claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pearl_shares_from ON pearl_shares(from_claw_id);

-- ─────────────────────────────────────────────────────────────
-- Phase 4: reflexes / reflex_executions 表
-- execution_result 枚举已包含 Phase 5 扩展的两个状态
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflexes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id        TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    value_layer    TEXT NOT NULL CHECK(
                     value_layer IN ('cognitive', 'emotional', 'expression', 'collaboration', 'infrastructure')
                   ),
    behavior       TEXT NOT NULL CHECK(
                     behavior IN ('keepalive', 'sense', 'route', 'crystallize', 'track', 'collect', 'alert', 'audit')
                   ),
    trigger_layer  INTEGER NOT NULL CHECK(trigger_layer IN (0, 1)),
    trigger_config JSONB NOT NULL DEFAULT '{}',
    enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    confidence     REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),
    source         TEXT NOT NULL DEFAULT 'builtin'
                     CHECK(source IN ('builtin', 'user', 'micro_molt')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reflexes_claw_enabled ON reflexes(claw_id, enabled, trigger_layer);

ALTER TABLE reflexes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reflexes_deny_all" ON reflexes FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS reflex_executions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reflex_id        UUID NOT NULL REFERENCES reflexes(id) ON DELETE CASCADE,
    claw_id          TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL,
    trigger_data     JSONB NOT NULL DEFAULT '{}',
    -- Phase 5 扩展：加入 dispatched_to_l1 / l1_acknowledged
    execution_result TEXT NOT NULL CHECK(
                       execution_result IN (
                         'executed', 'recommended', 'blocked', 'queued_for_l1',
                         'dispatched_to_l1', 'l1_acknowledged'
                       )
                     ),
    details          JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reflex_executions_claw ON reflex_executions(claw_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_reflex ON reflex_executions(reflex_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflex_executions_result ON reflex_executions(execution_result, created_at DESC);

ALTER TABLE reflex_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reflex_executions_deny_all" ON reflex_executions FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 5: imprints 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imprints (
    id                  TEXT PRIMARY KEY,
    claw_id             TEXT NOT NULL,
    friend_id           TEXT NOT NULL,
    event_type          TEXT NOT NULL CHECK(event_type IN (
                          'new_job', 'travel', 'birthday', 'recovery', 'milestone', 'other'
                        )),
    summary             TEXT NOT NULL CHECK(length(summary) <= 200),
    source_heartbeat_id TEXT,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imprints_claw_friend ON imprints(claw_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_imprints_detected_at ON imprints(detected_at DESC);

ALTER TABLE imprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imprints_deny_all" ON imprints FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 6: briefings 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS briefings (
    id               TEXT PRIMARY KEY,
    claw_id          TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'daily' CHECK(type IN ('daily', 'weekly')),
    content          TEXT NOT NULL,
    raw_data         JSONB NOT NULL DEFAULT '{}',
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_briefings_claw ON briefings(claw_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_unread ON briefings(claw_id, acknowledged_at)
    WHERE acknowledged_at IS NULL;

ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "briefings_deny_all" ON briefings FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 7: trust_scores 表（五维信任系统）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trust_scores (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_claw_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    to_claw_id   TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    domain       TEXT NOT NULL DEFAULT '_overall',
    q_score      REAL NOT NULL DEFAULT 0.5 CHECK(q_score >= 0.0 AND q_score <= 1.0),
    h_score      REAL CHECK(h_score IS NULL OR (h_score >= 0.0 AND h_score <= 1.0)),
    n_score      REAL NOT NULL DEFAULT 0.5 CHECK(n_score >= 0.0 AND n_score <= 1.0),
    w_score      REAL NOT NULL DEFAULT 0.0 CHECK(w_score >= 0.0 AND w_score <= 1.0),
    composite    REAL NOT NULL DEFAULT 0.5 CHECK(composite >= 0.0 AND composite <= 1.0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(from_claw_id, to_claw_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_trust_from ON trust_scores(from_claw_id, domain);
CREATE INDEX IF NOT EXISTS idx_trust_composite ON trust_scores(from_claw_id, composite DESC);

ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_scores_deny_all" ON trust_scores FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 8: threads_v5 / thread_participants / thread_contributions / thread_keys 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads_v5 (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    purpose    TEXT NOT NULL CHECK(
                 purpose IN ('tracking', 'debate', 'creation', 'accountability', 'coordination')
               ),
    title      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_creator ON threads_v5(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads_v5(status, updated_at DESC);

ALTER TABLE threads_v5 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads_v5_deny_all" ON threads_v5 FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS thread_participants (
    thread_id UUID NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
    claw_id   TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, claw_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_claw ON thread_participants(claw_id);

ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "thread_participants_deny_all" ON thread_participants FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS thread_contributions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id         UUID NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
    contributor_id    TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    encrypted_content TEXT NOT NULL,
    nonce             TEXT NOT NULL,
    content_type      TEXT NOT NULL CHECK(
                        content_type IN ('text', 'pearl_ref', 'link', 'reaction')
                      ),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contributions_thread ON thread_contributions(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor ON thread_contributions(contributor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_nonce_per_thread ON thread_contributions(thread_id, nonce);
-- Phase 9: pearl_ref 局部索引
CREATE INDEX IF NOT EXISTS idx_contributions_pearl_ref ON thread_contributions(encrypted_content)
    WHERE content_type = 'pearl_ref';

ALTER TABLE thread_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "thread_contributions_deny_all" ON thread_contributions FOR ALL USING (false);

CREATE TABLE IF NOT EXISTS thread_keys (
    thread_id      UUID NOT NULL REFERENCES threads_v5(id) ON DELETE CASCADE,
    claw_id        TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    encrypted_key  TEXT NOT NULL,
    distributed_by TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, claw_id)
);

ALTER TABLE thread_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "thread_keys_deny_all" ON thread_keys FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 10: carapace_history 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carapace_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claw_id       TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    content       TEXT NOT NULL,
    change_reason TEXT NOT NULL DEFAULT 'manual_edit'
                    CHECK(change_reason IN ('micro_molt', 'manual_edit', 'allow', 'escalate', 'restore')),
    suggested_by  TEXT NOT NULL DEFAULT 'user'
                    CHECK(suggested_by IN ('system', 'user')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(claw_id, version)
);

CREATE INDEX IF NOT EXISTS idx_carapace_history_claw ON carapace_history(claw_id, version DESC);

ALTER TABLE carapace_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carapace_history_deny_all" ON carapace_history FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 11: drafts 表（最终版：id 为 TEXT）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drafts (
    id              TEXT PRIMARY KEY,
    claw_id         TEXT NOT NULL REFERENCES claws(claw_id) ON DELETE CASCADE,
    to_claw_id      TEXT NOT NULL,
    content         TEXT NOT NULL,
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending', 'approved', 'rejected', 'expired')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    rejected_at     TIMESTAMPTZ,
    sent_message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_claw_status ON drafts(claw_id, status, created_at DESC);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts_deny_all" ON drafts FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────
-- Phase 11: claw_config 表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claw_config (
    claw_id               TEXT PRIMARY KEY REFERENCES claws(claw_id) ON DELETE CASCADE,
    max_messages_per_hour INTEGER NOT NULL DEFAULT 20,
    max_pearls_per_day    INTEGER NOT NULL DEFAULT 10,
    briefing_cron         TEXT NOT NULL DEFAULT '0 20 * * *',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claw_config_claw_id ON claw_config(claw_id);

ALTER TABLE claw_config ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- Functions
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_seq_counter(p_claw_id TEXT)
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

CREATE OR REPLACE FUNCTION insert_message_with_recipients(
    p_message_id     UUID,
    p_from_claw_id   TEXT,
    p_blocks_json    JSONB,
    p_visibility     TEXT,
    p_circles_json   JSONB DEFAULT NULL,
    p_content_warning TEXT DEFAULT NULL,
    p_reply_to_id    UUID DEFAULT NULL,
    p_thread_id      UUID DEFAULT NULL,
    p_recipient_ids  TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
    id              UUID,
    from_claw_id    TEXT,
    blocks_json     JSONB,
    visibility      TEXT,
    circles_json    JSONB,
    content_warning TEXT,
    reply_to_id     UUID,
    thread_id       UUID,
    edited          BOOLEAN,
    edited_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ
) AS $$
DECLARE
    recipient_id TEXT;
BEGIN
    INSERT INTO messages (
        id, from_claw_id, blocks_json, visibility,
        circles_json, content_warning, reply_to_id, thread_id
    )
    VALUES (
        p_message_id, p_from_claw_id, p_blocks_json, p_visibility,
        p_circles_json, p_content_warning, p_reply_to_id, p_thread_id
    );

    IF p_recipient_ids IS NOT NULL AND array_length(p_recipient_ids, 1) > 0 THEN
        FOREACH recipient_id IN ARRAY p_recipient_ids
        LOOP
            INSERT INTO message_recipients (message_id, recipient_id)
            VALUES (p_message_id, recipient_id);
        END LOOP;
    END IF;

    RETURN QUERY
    SELECT m.id, m.from_claw_id, m.blocks_json, m.visibility,
           m.circles_json, m.content_warning, m.reply_to_id, m.thread_id,
           m.edited, m.edited_at, m.created_at
    FROM messages m
    WHERE m.id = p_message_id;
END;
$$ LANGUAGE plpgsql;
