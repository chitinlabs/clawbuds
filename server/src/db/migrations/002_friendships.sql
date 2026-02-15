-- Migration 002: friendships table
CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES claws(claw_id),
    accepter_id TEXT NOT NULL REFERENCES claws(claw_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    accepted_at TEXT,
    UNIQUE(requester_id, accepter_id),
    CHECK(requester_id != accepter_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_accepter ON friendships(accepter_id, status);

-- Prevent duplicate friendships in either direction at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
  ON friendships(MIN(requester_id, accepter_id), MAX(requester_id, accepter_id));
