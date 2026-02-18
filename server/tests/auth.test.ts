import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  type TestContext,
} from './e2e/helpers.js'

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

describe.each(getAvailableRepositoryTypes())('Auth API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('POST /api/v1/register', () => {
    it('should register a new claw', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: "Alice's Claw",
        bio: 'Hello world',
      })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.clawId).toMatch(/^claw_[0-9a-f]{16}$/)
      expect(res.body.data.publicKey).toBe(keys.publicKey)
      expect(res.body.data.displayName).toBe("Alice's Claw")
      expect(res.body.data.bio).toBe('Hello world')
      expect(res.body.data.status).toBe('active')
    })

    it('should register without bio', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: "Bob's Claw",
      })

      expect(res.status).toBe(201)
      expect(res.body.data.bio).toBe('')
    })

    it('should reject duplicate public key', async () => {
      const keys = generateKeyPair()
      await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'First',
      })

      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Second',
      })

      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('should reject invalid public key format', async () => {
      const res = await request(app).post('/api/v1/register').send({
        publicKey: 'not-a-valid-hex',
        displayName: 'Bad Key',
      })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should reject missing displayName', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
      })

      expect(res.status).toBe(400)
    })

    it('should reject empty displayName', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: '',
      })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/v1/me', () => {
    it('should return profile with valid auth', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      const headers = signedHeaders('GET', '/api/v1/me', clawId, keys.privateKey)
      const res = await request(app).get('/api/v1/me').set(headers)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.clawId).toBe(clawId)
      expect(res.body.data.displayName).toBe('Alice')
    })

    it('should reject missing auth headers', async () => {
      const res = await request(app).get('/api/v1/me')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('MISSING_AUTH_HEADERS')
    })

    it('should reject invalid signature', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      const res = await request(app).get('/api/v1/me').set({
        'X-Claw-Id': clawId,
        'X-Claw-Timestamp': String(Date.now()),
        'X-Claw-Signature': 'a'.repeat(128),
      })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })

    it('should reject expired timestamp', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      const oldTimestamp = String(Date.now() - 6 * 60 * 1000) // 6 min ago
      const message = buildSignMessage('GET', '/api/v1/me', oldTimestamp, '')
      const signature = sign(message, keys.privateKey)

      const res = await request(app).get('/api/v1/me').set({
        'X-Claw-Id': clawId,
        'X-Claw-Timestamp': oldTimestamp,
        'X-Claw-Signature': signature,
      })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('REQUEST_EXPIRED')
    })

    it('should reject unknown claw id', async () => {
      const keys = generateKeyPair()
      const headers = signedHeaders('GET', '/api/v1/me', 'claw_0000000000', keys.privateKey)
      const res = await request(app).get('/api/v1/me').set(headers)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('CLAW_NOT_FOUND')
    })

    it('should reject wrong private key', async () => {
      const alice = generateKeyPair()
      const bob = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: alice.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      // Sign with bob's key, try to auth as alice
      const headers = signedHeaders('GET', '/api/v1/me', clawId, bob.privateKey)
      const res = await request(app).get('/api/v1/me').set(headers)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_SIGNATURE')
    })
  })

  describe('PATCH /api/v1/me', () => {
    it('should update displayName', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Old Name',
      })
      const clawId = regRes.body.data.clawId

      const body = { displayName: 'New Name' }
      const headers = signedHeaders('PATCH', '/api/v1/me', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me').set(headers).send(body)

      expect(res.status).toBe(200)
      expect(res.body.data.displayName).toBe('New Name')
    })

    it('should update bio', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      const body = { bio: 'New bio content' }
      const headers = signedHeaders('PATCH', '/api/v1/me', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me').set(headers).send(body)

      expect(res.status).toBe(200)
      expect(res.body.data.bio).toBe('New bio content')
    })

    it('should reject empty update', async () => {
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'Alice',
      })
      const clawId = regRes.body.data.clawId

      const body = {}
      const headers = signedHeaders('PATCH', '/api/v1/me', clawId, keys.privateKey, body)
      const res = await request(app).patch('/api/v1/me').set(headers).send(body)

      expect(res.status).toBe(400)
    })

    it('should reject without auth', async () => {
      const res = await request(app).patch('/api/v1/me').send({ displayName: 'Hacker' })

      expect(res.status).toBe(401)
    })
  })

  describe('Registration with discovery fields', () => {
    it('should register with tags', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'TaggedClaw',
        tags: ['ai', 'helper'],
      })

      expect(res.status).toBe(201)
      expect(res.body.data.tags).toEqual(['ai', 'helper'])
      expect(res.body.data.discoverable).toBe(false)
    })

    it('should register with discoverable=true', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'DiscoverableClaw',
        discoverable: true,
      })

      expect(res.status).toBe(201)
      expect(res.body.data.discoverable).toBe(true)
    })

    it('should have correct defaults for new fields', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'DefaultClaw',
      })

      expect(res.status).toBe(201)
      expect(res.body.data.clawType).toBe('personal')
      expect(res.body.data.discoverable).toBe(false)
      expect(res.body.data.tags).toEqual([])
      expect(res.body.data.capabilities).toEqual([])
      expect(res.body.data.autonomyLevel).toBe('notifier')
      expect(res.body.data.brainProvider).toBe('headless')
    })

    it('should reject too many tags on register', async () => {
      const keys = generateKeyPair()
      const res = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: 'TooManyTags',
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('Full registration + auth flow', () => {
    it('should complete register -> auth -> view profile -> update profile', async () => {
      // 1. Register
      const keys = generateKeyPair()
      const regRes = await request(app).post('/api/v1/register').send({
        publicKey: keys.publicKey,
        displayName: "Alice's Claw",
        bio: 'Original bio',
      })
      expect(regRes.status).toBe(201)
      const clawId = regRes.body.data.clawId

      // 2. View profile
      const meHeaders = signedHeaders('GET', '/api/v1/me', clawId, keys.privateKey)
      const meRes = await request(app).get('/api/v1/me').set(meHeaders)
      expect(meRes.status).toBe(200)
      expect(meRes.body.data.displayName).toBe("Alice's Claw")

      // 3. Update profile
      const updateBody = { displayName: 'Alice v2', bio: 'Updated bio' }
      const patchHeaders = signedHeaders('PATCH', '/api/v1/me', clawId, keys.privateKey, updateBody)
      const patchRes = await request(app).patch('/api/v1/me').set(patchHeaders).send(updateBody)
      expect(patchRes.status).toBe(200)
      expect(patchRes.body.data.displayName).toBe('Alice v2')
      expect(patchRes.body.data.bio).toBe('Updated bio')

      // 4. Verify update persisted
      const meHeaders2 = signedHeaders('GET', '/api/v1/me', clawId, keys.privateKey)
      const meRes2 = await request(app).get('/api/v1/me').set(meHeaders2)
      expect(meRes2.body.data.displayName).toBe('Alice v2')
    })
  })
})
