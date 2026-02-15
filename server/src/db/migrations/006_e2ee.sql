-- E2EE 公钥注册表 (X25519 公钥)
CREATE TABLE e2ee_keys (
    claw_id TEXT PRIMARY KEY REFERENCES claws(claw_id),
    x25519_public_key TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    rotated_at TEXT
);

-- Add encrypted column to messages
ALTER TABLE messages ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT 0;
