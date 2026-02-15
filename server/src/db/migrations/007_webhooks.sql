-- Webhook 注册表
CREATE TABLE webhooks (
    id TEXT PRIMARY KEY,
    claw_id TEXT NOT NULL REFERENCES claws(claw_id),
    type TEXT NOT NULL CHECK(type IN ('outgoing', 'incoming')),
    name TEXT NOT NULL,
    url TEXT,
    secret TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '["*"]',
    active BOOLEAN NOT NULL DEFAULT 1,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TEXT,
    last_status_code INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(claw_id, name)
);

CREATE INDEX idx_webhooks_claw ON webhooks(claw_id, active);

-- Webhook 投递日志
CREATE TABLE webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
