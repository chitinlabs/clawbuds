import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import { createApp } from '../src/app.js'
import { createTestDatabase } from '../src/db/database.js'

function signedHeaders(
  method: string,
  path: string,
  clawId: string,
  privateKey: string,
  body?: Record<string, unknown>,
) {
  const timestamp = String(Date.now())
  const bodyString = body ? JSON.stringify(body) : ''
  const message = buildSignMessage(method, path, timestamp, bodyString)
  const signature = sign(message, privateKey)
  return {
    'X-Claw-Id': clawId,
    'X-Claw-Timestamp': timestamp,
    'X-Claw-Signature': signature,
  }
}

async function registerClaw(
  app: ReturnType<typeof createApp>['app'],
  opts?: { displayName?: string; bio?: string; tags?: string[]; discoverable?: boolean },
) {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: opts?.displayName ?? 'TestClaw',
    bio: opts?.bio ?? '',
    tags: opts?.tags,
    discoverable: opts?.discoverable,
  })
  return { keys, clawId: res.body.data.clawId, res }
}

describe('Discovery API', () => {
  let db: Database.Database
  let app: ReturnType<typeof createApp>['app']

  beforeEach(() => {
    db = createTestDatabase()
    ;({ app } = createApp(db))
  })

  afterEach(() => {
    db.close()
  })

  describe('GET /api/v1/discover', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/v1/discover')
      expect(res.status).toBe(401)
    })

    it('should return empty results when no discoverable claws', async () => {
      const { keys, clawId } = await registerClaw(app)
      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.results).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it('should find discoverable claws', async () => {
      // Register a discoverable claw
      const { keys: aliceKeys, clawId: aliceId } = await registerClaw(app, {
        displayName: 'Alice',
        discoverable: true,
        tags: ['ai', 'chat'],
      })

      // Register a non-discoverable claw (the searcher)
      const { keys: bobKeys, clawId: bobId } = await registerClaw(app, {
        displayName: 'Bob',
      })

      const headers = signedHeaders('GET', '/api/v1/discover', bobId, bobKeys.privateKey)
      const res = await request(app).get('/api/v1/discover').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].clawId).toBe(aliceId)
      expect(res.body.data.results[0].displayName).toBe('Alice')
      expect(res.body.data.results[0].tags).toEqual(['ai', 'chat'])
      expect(res.body.data.total).toBe(1)
    })

    it('should search by keyword in displayName', async () => {
      await registerClaw(app, { displayName: 'Alice Bot', discoverable: true })
      await registerClaw(app, { displayName: 'Bob Helper', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover?q=alice').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe('Alice Bot')
    })

    it('should search by keyword in bio', async () => {
      await registerClaw(app, { displayName: 'Helper', bio: 'I help with coding tasks', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover?q=coding').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe('Helper')
    })

    it('should filter by tags', async () => {
      await registerClaw(app, { displayName: 'AI Bot', tags: ['ai', 'ml'], discoverable: true })
      await registerClaw(app, { displayName: 'Chat Bot', tags: ['chat'], discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover?tags=ai').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe('AI Bot')
    })

    it('should not return non-discoverable claws', async () => {
      await registerClaw(app, { displayName: 'Hidden', discoverable: false })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(0)
    })

    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await registerClaw(app, { displayName: `Bot ${i}`, discoverable: true })
      }
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover?limit=2&offset=0').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(2)
      expect(res.body.data.total).toBe(5)

      const headers2 = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res2 = await request(app).get('/api/v1/discover?limit=2&offset=2').set(headers2)

      expect(res2.status).toBe(200)
      expect(res2.body.data.results).toHaveLength(2)
      expect(res2.body.data.total).toBe(5)
    })

    it('should filter by claw type', async () => {
      // Default type is 'personal', need to set via DB directly for service/bot
      await registerClaw(app, { displayName: 'PersonalClaw', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      // Update one to be a 'service' type via DB
      const { clawId: serviceId } = await registerClaw(app, { displayName: 'ServiceBot', discoverable: true })
      db.prepare("UPDATE claws SET claw_type = 'service' WHERE claw_id = ?").run(serviceId)

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover?type=service').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe('ServiceBot')
    })
  })

  describe('GET /api/v1/discover/recent', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/v1/discover/recent')
      expect(res.status).toBe(401)
    })

    it('should return recently joined discoverable claws', async () => {
      await registerClaw(app, { displayName: 'OldClaw', discoverable: true })
      await registerClaw(app, { displayName: 'NewClaw', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover/recent', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover/recent').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeInstanceOf(Array)
      expect(res.body.data.length).toBe(2)
    })

    it('should not include non-discoverable claws', async () => {
      await registerClaw(app, { displayName: 'Hidden', discoverable: false })
      await registerClaw(app, { displayName: 'Visible', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover/recent', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover/recent').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].displayName).toBe('Visible')
    })
  })
})
