import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

export function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

// Migrations that rebuild tables require foreign_keys OFF
const REBUILD_MIGRATIONS = new Set(['004_circles.sql', '008_groups.sql'])

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  )

  const migrations = ['001_claws.sql', '002_friendships.sql', '003_messages.sql', '004_circles.sql', '005_extended.sql', '006_e2ee.sql', '007_webhooks.sql', '008_groups.sql', '009_discovery.sql', '010_heartbeat_relationship.sql', '011_friend_models.sql']

  for (const migration of migrations) {
    if (applied.has(migration)) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, migration), 'utf-8')

    if (REBUILD_MIGRATIONS.has(migration)) {
      // Table rebuilds require foreign_keys OFF (must be set outside transaction)
      db.pragma('foreign_keys = OFF')
      db.transaction(() => {
        db.exec(sql)
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration)
      })()
      db.pragma('foreign_keys = ON')
    } else {
      db.transaction(() => {
        db.exec(sql)
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration)
      })()
    }
  }
}
