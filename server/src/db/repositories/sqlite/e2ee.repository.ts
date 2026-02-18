import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { IE2eeRepository, E2eeKeyProfile, SenderKeyProfile, UploadSenderKeyInput } from '../interfaces/e2ee.repository.interface.js'
import { E2eeError } from '../interfaces/e2ee.repository.interface.js'

interface E2eeKeyRow {
  claw_id: string
  x25519_public_key: string
  key_fingerprint: string
  created_at: string
  rotated_at: string | null
}

interface SenderKeyRow {
  id: string
  group_id: string
  sender_id: string
  recipient_id: string
  encrypted_key: string
  key_generation: number
  created_at: string
}

function rowToProfile(row: E2eeKeyRow): E2eeKeyProfile {
  return {
    clawId: row.claw_id,
    x25519PublicKey: row.x25519_public_key,
    keyFingerprint: row.key_fingerprint,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
  }
}

function senderKeyRowToProfile(row: SenderKeyRow): SenderKeyProfile {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    encryptedKey: row.encrypted_key,
    keyGeneration: row.key_generation,
    createdAt: row.created_at,
  }
}

export class SqliteE2eeRepository implements IE2eeRepository {
  constructor(private db: Database.Database) {}

  async registerKey(clawId: string, x25519PublicKey: string, fingerprint: string): Promise<E2eeKeyProfile> {
    const existing = await this.findByClawId(clawId)

    if (existing) {
      const row = this.db
        .prepare(
          `UPDATE e2ee_keys
           SET x25519_public_key = ?, key_fingerprint = ?, rotated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE claw_id = ?
           RETURNING *`,
        )
        .get(x25519PublicKey, fingerprint, clawId) as E2eeKeyRow
      return rowToProfile(row)
    }

    const row = this.db
      .prepare(
        `INSERT INTO e2ee_keys (claw_id, x25519_public_key, key_fingerprint)
         VALUES (?, ?, ?) RETURNING *`,
      )
      .get(clawId, x25519PublicKey, fingerprint) as E2eeKeyRow

    return rowToProfile(row)
  }

  async findByClawId(clawId: string): Promise<E2eeKeyProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM e2ee_keys WHERE claw_id = ?')
      .get(clawId) as E2eeKeyRow | undefined
    return row ? rowToProfile(row) : null
  }

  async findByClawIds(clawIds: string[]): Promise<E2eeKeyProfile[]> {
    if (clawIds.length === 0) return []

    const placeholders = clawIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT * FROM e2ee_keys WHERE claw_id IN (${placeholders})`)
      .all(...clawIds) as E2eeKeyRow[]

    return rows.map(rowToProfile)
  }

  async deleteKey(clawId: string): Promise<void> {
    const result = this.db
      .prepare('DELETE FROM e2ee_keys WHERE claw_id = ?')
      .run(clawId)

    if (result.changes === 0) {
      throw new E2eeError('NOT_FOUND', 'No E2EE key registered')
    }
  }

  async uploadSenderKeys(
    groupId: string,
    senderId: string,
    keys: UploadSenderKeyInput[],
    keyGeneration: number,
  ): Promise<SenderKeyProfile[]> {
    const results: SenderKeyProfile[] = []

    this.db.transaction(() => {
      const stmt = this.db.prepare(
        `INSERT INTO group_sender_keys (id, group_id, sender_id, recipient_id, encrypted_key, key_generation)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(group_id, sender_id, recipient_id, key_generation) DO UPDATE SET encrypted_key = excluded.encrypted_key
         RETURNING *`,
      )

      for (const key of keys) {
        const row = stmt.get(
          randomUUID(),
          groupId,
          senderId,
          key.recipientId,
          key.encryptedKey,
          keyGeneration,
        ) as SenderKeyRow
        results.push(senderKeyRowToProfile(row))
      }
    })()

    return results
  }

  async getSenderKeys(groupId: string, recipientId: string): Promise<SenderKeyProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM group_sender_keys
         WHERE group_id = ? AND recipient_id = ?
         ORDER BY key_generation DESC, sender_id ASC`,
      )
      .all(groupId, recipientId) as SenderKeyRow[]

    return rows.map(senderKeyRowToProfile)
  }

  async getLatestKeyGeneration(groupId: string, senderId: string): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT MAX(key_generation) AS gen FROM group_sender_keys
         WHERE group_id = ? AND sender_id = ?`,
      )
      .get(groupId, senderId) as { gen: number | null }
    return row.gen || 0
  }
}
