import type Database from 'better-sqlite3'
import { generateClawId } from '@clawbuds/shared'
import type { AutonomyLevel, AutonomyConfig, NotificationPreferences, ClawType } from '@clawbuds/shared'

export type ClawStatus = 'active' | 'suspended' | 'deactivated'

interface ClawRow {
  claw_id: string
  public_key: string
  display_name: string
  bio: string
  status: ClawStatus
  created_at: string
  last_seen_at: string
  claw_type: ClawType
  discoverable: number
  tags: string
  capabilities: string
  avatar_url: string | null
  autonomy_level: AutonomyLevel
  autonomy_config: string
  brain_provider: string
  notification_prefs: string
}

export interface ClawProfile {
  clawId: string
  publicKey: string
  displayName: string
  bio: string
  status: ClawStatus
  createdAt: string
  lastSeenAt: string
  clawType: ClawType
  discoverable: boolean
  tags: string[]
  capabilities: string[]
  avatarUrl?: string
  autonomyLevel: AutonomyLevel
  autonomyConfig: AutonomyConfig
  brainProvider: string
  notificationPrefs: NotificationPreferences
}

function rowToProfile(row: ClawRow): ClawProfile {
  return {
    clawId: row.claw_id,
    publicKey: row.public_key,
    displayName: row.display_name,
    bio: row.bio,
    status: row.status,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    clawType: row.claw_type,
    discoverable: row.discoverable === 1,
    tags: JSON.parse(row.tags),
    capabilities: JSON.parse(row.capabilities),
    avatarUrl: row.avatar_url ?? undefined,
    autonomyLevel: row.autonomy_level,
    autonomyConfig: JSON.parse(row.autonomy_config),
    brainProvider: row.brain_provider,
    notificationPrefs: JSON.parse(row.notification_prefs),
  }
}

export interface RegisterOptions {
  tags?: string[]
  discoverable?: boolean
}

export class ClawService {
  constructor(private db: Database.Database) {}

  register(publicKey: string, displayName: string, bio?: string, options?: RegisterOptions): ClawProfile {
    const existing = this.findByPublicKey(publicKey)
    if (existing) {
      throw new ConflictError('Public key already registered')
    }

    const clawId = generateClawId(publicKey)

    const existingId = this.findById(clawId)
    if (existingId) {
      throw new ConflictError('ClawID collision, please generate a new key pair')
    }

    const tags = JSON.stringify(options?.tags ?? [])
    const discoverable = options?.discoverable === true ? 1 : 0  // 默认为 false（不可发现）

    this.db
      .prepare(
        `INSERT INTO claws (claw_id, public_key, display_name, bio, tags, discoverable)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(clawId, publicKey, displayName, bio ?? '', tags, discoverable)

    return this.findById(clawId)!
  }

  findById(clawId: string): ClawProfile | null {
    const row = this.db.prepare('SELECT * FROM claws WHERE claw_id = ?').get(clawId) as
      | ClawRow
      | undefined
    return row ? rowToProfile(row) : null
  }

  findByPublicKey(publicKey: string): ClawProfile | null {
    const row = this.db.prepare('SELECT * FROM claws WHERE public_key = ?').get(publicKey) as
      | ClawRow
      | undefined
    return row ? rowToProfile(row) : null
  }

  updateProfile(
    clawId: string,
    updates: { displayName?: string; bio?: string },
  ): ClawProfile | null {
    const claw = this.findById(clawId)
    if (!claw) return null

    const displayName = updates.displayName ?? claw.displayName
    const bio = updates.bio ?? claw.bio

    this.db
      .prepare(
        `UPDATE claws SET display_name = ?, bio = ?,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ?`,
      )
      .run(displayName, bio, clawId)

    return this.findById(clawId)!
  }

  updateExtendedProfile(
    clawId: string,
    updates: {
      displayName?: string
      bio?: string
      tags?: string[]
      discoverable?: boolean
      avatarUrl?: string
    },
  ): ClawProfile | null {
    const claw = this.findById(clawId)
    if (!claw) return null

    const displayName = updates.displayName ?? claw.displayName
    const bio = updates.bio ?? claw.bio
    const tags = JSON.stringify(updates.tags ?? claw.tags)
    const discoverable = updates.discoverable !== undefined ? (updates.discoverable ? 1 : 0) : (claw.discoverable ? 1 : 0)
    const avatarUrl = updates.avatarUrl !== undefined ? updates.avatarUrl : (claw.avatarUrl ?? null)

    this.db
      .prepare(
        `UPDATE claws SET display_name = ?, bio = ?, tags = ?, discoverable = ?, avatar_url = ?,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ?`,
      )
      .run(displayName, bio, tags, discoverable, avatarUrl, clawId)

    return this.findById(clawId)!
  }

  getAutonomyConfig(clawId: string): { autonomyLevel: AutonomyLevel; autonomyConfig: AutonomyConfig } | null {
    const claw = this.findById(clawId)
    if (!claw) return null
    return { autonomyLevel: claw.autonomyLevel, autonomyConfig: claw.autonomyConfig }
  }

  updateAutonomyConfig(
    clawId: string,
    updates: { autonomyLevel?: AutonomyLevel; autonomyConfig?: AutonomyConfig },
  ): ClawProfile | null {
    const claw = this.findById(clawId)
    if (!claw) return null

    const autonomyLevel = updates.autonomyLevel ?? claw.autonomyLevel
    const autonomyConfig = JSON.stringify(updates.autonomyConfig ?? claw.autonomyConfig)

    this.db
      .prepare(
        `UPDATE claws SET autonomy_level = ?, autonomy_config = ?,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ?`,
      )
      .run(autonomyLevel, autonomyConfig, clawId)

    return this.findById(clawId)!
  }

  updateNotificationPrefs(clawId: string, prefs: NotificationPreferences): ClawProfile | null {
    const claw = this.findById(clawId)
    if (!claw) return null

    this.db
      .prepare(
        `UPDATE claws SET notification_prefs = ?,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE claw_id = ?`,
      )
      .run(JSON.stringify(prefs), clawId)

    return this.findById(clawId)!
  }

  updateLastSeen(clawId: string): void {
    this.db
      .prepare(`UPDATE claws SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE claw_id = ?`)
      .run(clawId)
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}
