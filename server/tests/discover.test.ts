import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import { createTestContext, destroyTestContext, getAvailableRepositoryTypes, type TestContext } from './e2e/helpers.js'

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
  app: TestContext['app'],
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

/** Generate a unique prefix for test isolation on shared databases */
function uniquePrefix(): string {
  return `t${randomBytes(4).toString('hex')}`
}

describe.each(getAvailableRepositoryTypes())('Discovery API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']
  const isSupabase = () => repositoryType === 'supabase'

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('GET /api/v1/discover', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/v1/discover')
      expect(res.status).toBe(401)
    })

    it('should return empty results when no discoverable claws', async () => {
      const { keys, clawId } = await registerClaw(app)
      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)

      // On Supabase, search with a unique term that doesn't exist to ensure empty results
      const searchParam = isSupabase() ? `?q=${uniquePrefix()}nonexistent` : ''
      const res = await request(app).get(`/api/v1/discover${searchParam}`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.results).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it('should find discoverable claws', async () => {
      const prefix = uniquePrefix()
      // Register a discoverable claw with unique name
      const { keys: aliceKeys, clawId: aliceId } = await registerClaw(app, {
        displayName: `${prefix}Alice`,
        discoverable: true,
        tags: ['ai', 'chat'],
      })

      // Register a non-discoverable claw (the searcher)
      const { keys: bobKeys, clawId: bobId } = await registerClaw(app, {
        displayName: `${prefix}Bob`,
      })

      const headers = signedHeaders('GET', '/api/v1/discover', bobId, bobKeys.privateKey)
      const res = await request(app).get(`/api/v1/discover?q=${prefix}`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].clawId).toBe(aliceId)
      expect(res.body.data.results[0].displayName).toBe(`${prefix}Alice`)
      expect(res.body.data.results[0].tags).toEqual(['ai', 'chat'])
      expect(res.body.data.total).toBe(1)
    })

    it('should search by keyword in displayName', async () => {
      const prefix = uniquePrefix()
      await registerClaw(app, { displayName: `${prefix}Alice Bot`, discoverable: true })
      await registerClaw(app, { displayName: `${prefix}Bob Helper`, discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get(`/api/v1/discover?q=${prefix}Alice`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe(`${prefix}Alice Bot`)
    })

    it('should search by keyword in bio', async () => {
      const prefix = uniquePrefix()
      await registerClaw(app, {
        displayName: `${prefix}Helper`,
        bio: `I help with ${prefix}coding tasks`,
        discoverable: true,
      })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get(`/api/v1/discover?q=${prefix}coding`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe(`${prefix}Helper`)
    })

    it('should filter by tags', async () => {
      const prefix = uniquePrefix()
      const uniqueTag = `${prefix}ai`
      await registerClaw(app, { displayName: `${prefix}AI Bot`, tags: [uniqueTag, 'ml'], discoverable: true })
      await registerClaw(app, { displayName: `${prefix}Chat Bot`, tags: ['chat'], discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get(`/api/v1/discover?tags=${uniqueTag}`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0].displayName).toBe(`${prefix}AI Bot`)
    })

    it('should not return non-discoverable claws', async () => {
      const prefix = uniquePrefix()
      await registerClaw(app, { displayName: `${prefix}Hidden`, discoverable: false })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get(`/api/v1/discover?q=${prefix}Hidden`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(0)
    })

    it('should paginate results', async () => {
      const prefix = uniquePrefix()
      for (let i = 0; i < 5; i++) {
        await registerClaw(app, { displayName: `${prefix}Bot ${i}`, discoverable: true })
      }
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res = await request(app).get(`/api/v1/discover?q=${prefix}Bot&limit=2&offset=0`).set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.results).toHaveLength(2)
      expect(res.body.data.total).toBe(5)

      const headers2 = signedHeaders('GET', '/api/v1/discover', clawId, keys.privateKey)
      const res2 = await request(app).get(`/api/v1/discover?q=${prefix}Bot&limit=2&offset=2`).set(headers2)

      expect(res2.status).toBe(200)
      expect(res2.body.data.results).toHaveLength(2)
      expect(res2.body.data.total).toBe(5)
    })

    it.skipIf(repositoryType !== 'sqlite')('should filter by claw type', async () => {
      // Default type is 'personal', need to set via DB directly for service/bot
      await registerClaw(app, { displayName: 'PersonalClaw', discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      // Update one to be a 'service' type via DB
      const { clawId: serviceId } = await registerClaw(app, { displayName: 'ServiceBot', discoverable: true })
      tc.db!.prepare("UPDATE claws SET claw_type = 'service' WHERE claw_id = ?").run(serviceId)

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
      const prefix = uniquePrefix()
      const { clawId: oldId } = await registerClaw(app, { displayName: `${prefix}OldClaw`, discoverable: true })
      const { clawId: newId } = await registerClaw(app, { displayName: `${prefix}NewClaw`, discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover/recent', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover/recent').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeInstanceOf(Array)
      // On Supabase, there may be more results from previous runs
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
      // Verify our created claws are present
      const ids = res.body.data.map((r: any) => r.clawId)
      expect(ids).toContain(oldId)
      expect(ids).toContain(newId)
    })

    it('should not include non-discoverable claws', async () => {
      const prefix = uniquePrefix()
      const { clawId: hiddenId } = await registerClaw(app, { displayName: `${prefix}Hidden`, discoverable: false })
      const { clawId: visibleId } = await registerClaw(app, { displayName: `${prefix}Visible`, discoverable: true })
      const { keys, clawId } = await registerClaw(app, { displayName: 'Searcher' })

      const headers = signedHeaders('GET', '/api/v1/discover/recent', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/discover/recent').set(headers)

      expect(res.status).toBe(200)
      const ids = res.body.data.map((r: any) => r.clawId)
      expect(ids).toContain(visibleId)
      expect(ids).not.toContain(hiddenId)
    })
  })
})
