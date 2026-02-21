import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

describe.each(getAvailableRepositoryTypes())('Profile API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('GET /api/v1/claws/:clawId/profile', () => {
    it('should return public profile without auth', async () => {
      const { clawId } = await registerClaw(app, {
        displayName: 'Alice',
        bio: 'Hello world',
      })

      const res = await request(app).get(`/api/v1/claws/${clawId}/profile`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.clawId).toBe(clawId)
      expect(res.body.data.displayName).toBe('Alice')
      expect(res.body.data.bio).toBe('Hello world')
      // Should not include sensitive fields
      expect(res.body.data.publicKey).toBeUndefined()
      expect(res.body.data.autonomyConfig).toBeUndefined()
      expect(res.body.data.notificationPrefs).toBeUndefined()
    })

    it('should return 404 for non-existent claw', async () => {
      const res = await request(app).get('/api/v1/claws/claw_0000000000000000/profile')
      expect(res.status).toBe(404)
    })

    it('should reject invalid claw ID format', async () => {
      const res = await request(app).get('/api/v1/claws/invalid-id/profile')
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/v1/me/profile', () => {
    it('should require auth', async () => {
      const res = await request(app).patch('/api/v1/me/profile').send({ displayName: 'Hacker' })
      expect(res.status).toBe(401)
    })

    it('should update tags and discoverable', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { tags: ['ai', 'chat'], discoverable: true }
      const headers = signedHeaders('PATCH', '/api/v1/me/profile', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/profile').set(headers).send(body)

      expect(res.status).toBe(200)
      expect(res.body.data.tags).toEqual(['ai', 'chat'])
      expect(res.body.data.discoverable).toBe(true)
    })

    it('should update displayName via extended profile', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { displayName: 'Alice v2' }
      const headers = signedHeaders('PATCH', '/api/v1/me/profile', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/profile').set(headers).send(body)

      expect(res.status).toBe(200)
      expect(res.body.data.displayName).toBe('Alice v2')
    })

    it('should reject empty update', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = {}
      const headers = signedHeaders('PATCH', '/api/v1/me/profile', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/profile').set(headers).send(body)

      expect(res.status).toBe(400)
    })

    it('should reject too many tags', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) }
      const headers = signedHeaders('PATCH', '/api/v1/me/profile', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/profile').set(headers).send(body)

      expect(res.status).toBe(400)
    })

    it('should reject tags longer than 30 chars', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { tags: ['a'.repeat(31)] }
      const headers = signedHeaders('PATCH', '/api/v1/me/profile', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/profile').set(headers).send(body)

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/v1/me/autonomy', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/v1/me/autonomy')
      expect(res.status).toBe(401)
    })

    it('should return default autonomy config', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const headers = signedHeaders('GET', '/api/v1/me/autonomy', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/me/autonomy').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.autonomyLevel).toBe('notifier')
      // T7: autonomy columns dropped; autonomyConfig returns hardcoded default
      expect(res.body.data.autonomyConfig.defaultLevel).toBe('notifier')
    })
  })

  describe('PATCH /api/v1/me/autonomy', () => {
    it('should require auth', async () => {
      const res = await request(app).patch('/api/v1/me/autonomy').send({ autonomyLevel: 'drafter' })
      expect(res.status).toBe(401)
    })

    // T7 (Phase 11B): autonomy_level/autonomy_config columns dropped.
    // PATCH /me/autonomy is now a no-op – updates accepted but not persisted.
    it('should accept autonomy level update (no-op since T7)', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { autonomyLevel: 'drafter' }
      const headers = signedHeaders('PATCH', '/api/v1/me/autonomy', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/autonomy').set(headers).send(body)

      expect(res.status).toBe(200)
      // autonomyLevel stays at hardcoded default 'notifier' (columns dropped)
      expect(res.body.data.autonomyLevel).toBe('notifier')
    })

    it('should accept autonomy config update (no-op since T7)', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = {
        autonomyConfig: {
          defaultLevel: 'autonomous' as const,
          escalationKeywords: ['urgent', 'help'],
        },
      }
      const headers = signedHeaders('PATCH', '/api/v1/me/autonomy', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/autonomy').set(headers).send(body)

      expect(res.status).toBe(200)
      // autonomyConfig stays at hardcoded default {} (columns dropped)
      expect(res.body.success).toBe(true)
    })

    it('should reject empty update', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = {}
      const headers = signedHeaders('PATCH', '/api/v1/me/autonomy', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/autonomy').set(headers).send(body)

      expect(res.status).toBe(400)
    })

    it('should reject invalid autonomy level', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { autonomyLevel: 'invalid' }
      const headers = signedHeaders('PATCH', '/api/v1/me/autonomy', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me/autonomy').set(headers).send(body)

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/v1/me/stats', () => {
    it('should require auth', async () => {
      const res = await request(app).get('/api/v1/me/stats')
      expect(res.status).toBe(401)
    })

    it('should return zero stats for new claw', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const headers = signedHeaders('GET', '/api/v1/me/stats', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/me/stats').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.data.messagesSent).toBe(0)
      expect(res.body.data.messagesReceived).toBe(0)
      expect(res.body.data.friendsCount).toBe(0)
    })
  })

  describe('POST /api/v1/me/push-subscription', () => {
    it('should require auth', async () => {
      const res = await request(app).post('/api/v1/me/push-subscription').send({
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'testkey', auth: 'testauthkey' },
      })
      expect(res.status).toBe(401)
    })

    it('should register a push subscription', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'testkey123', auth: 'authkey456' },
      }
      const headers = signedHeaders('POST', '/api/v1/me/push-subscription', clawId, keys.privateKey, body)
      const res = await request(app).post('/api/v1/me/push-subscription').set(headers).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.endpoint).toBe('https://push.example.com/sub1')
      expect(res.body.data.id).toBeDefined()
    })

    it('should reject invalid subscription', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { endpoint: 'not-a-url' }
      const headers = signedHeaders('POST', '/api/v1/me/push-subscription', clawId, keys.privateKey, body)
      const res = await request(app).post('/api/v1/me/push-subscription').set(headers).send(body)

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/v1/me/push-subscription', () => {
    it('should require auth', async () => {
      const res = await request(app).delete('/api/v1/me/push-subscription').send({
        endpoint: 'https://push.example.com/sub1',
      })
      expect(res.status).toBe(401)
    })

    it('should delete a push subscription', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      // First register a subscription
      const subBody = {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'testkey123', auth: 'authkey456' },
      }
      const subHeaders = signedHeaders('POST', '/api/v1/me/push-subscription', clawId, keys.privateKey, subBody)
      await request(app).post('/api/v1/me/push-subscription').set(subHeaders).send(subBody)

      // Then delete it
      const delBody = { endpoint: 'https://push.example.com/sub1' }
      const delHeaders = signedHeaders('DELETE', '/api/v1/me/push-subscription', clawId, keys.privateKey, delBody)
      const res = await request(app).delete('/api/v1/me/push-subscription').set(delHeaders).send(delBody)

      expect(res.status).toBe(200)
      expect(res.body.data.removed).toBe(true)
    })

    it('should return 404 for non-existent subscription', async () => {
      const { keys, clawId } = await registerClaw(app, { displayName: 'Alice' })

      const body = { endpoint: 'https://push.example.com/nonexistent' }
      const headers = signedHeaders('DELETE', '/api/v1/me/push-subscription', clawId, keys.privateKey, body)
      const res = await request(app).delete('/api/v1/me/push-subscription').set(headers).send(body)

      expect(res.status).toBe(404)
    })
  })
})
