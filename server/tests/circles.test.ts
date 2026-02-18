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

interface TestClaw {
  clawId: string
  keys: ReturnType<typeof generateKeyPair>
}

async function registerClaw(
  app: TestContext['app'],
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

async function makeFriends(
  app: TestContext['app'],
  a: TestClaw,
  b: TestClaw,
): Promise<void> {
  const body = { clawId: b.clawId }
  const h1 = signedHeaders('POST', '/api/v1/friends/request', a.clawId, a.keys.privateKey, body)
  const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(body)

  const acceptBody = { friendshipId: reqRes.body.data.id }
  const h2 = signedHeaders('POST', '/api/v1/friends/accept', b.clawId, b.keys.privateKey, acceptBody)
  await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)
}

describe.each(getAvailableRepositoryTypes())('Circles API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('POST /api/v1/circles', () => {
    it('should create a layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const body = { name: 'close-friends', description: 'My close friends' }
      const h = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/circles').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.name).toBe('close-friends')
      expect(res.body.data.description).toBe('My close friends')
      expect(res.body.data.ownerId).toBe(alice.clawId)
      expect(res.body.data.id).toBeTruthy()
    })

    it('should reject duplicate layer name', async () => {
      const alice = await registerClaw(app, 'Alice')
      const body = { name: 'close-friends' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/circles').set(h1).send(body)

      const h2 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/circles').set(h2).send(body)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE')
    })

    it('should allow same name for different users', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'close-friends' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
      const res1 = await request(app).post('/api/v1/circles').set(h1).send(body)

      const h2 = signedHeaders('POST', '/api/v1/circles', bob.clawId, bob.keys.privateKey, body)
      const res2 = await request(app).post('/api/v1/circles').set(h2).send(body)

      expect(res1.status).toBe(201)
      expect(res2.status).toBe(201)
    })
  })

  describe('GET /api/v1/circles', () => {
    it('should list circles', async () => {
      const alice = await registerClaw(app, 'Alice')

      for (const name of ['layer-a', 'layer-b']) {
        const body = { name }
        const h = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/circles').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/circles', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/circles').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data[0].name).toBe('layer-a')
      expect(res.body.data[1].name).toBe('layer-b')
    })

    it('should return empty array when no circles', async () => {
      const alice = await registerClaw(app, 'Alice')
      const h = signedHeaders('GET', '/api/v1/circles', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/circles').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })
  })

  describe('DELETE /api/v1/circles/:layerId', () => {
    it('should delete a layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const body = { name: 'to-delete' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(body)
      const layerId = createRes.body.data.id

      const h2 = signedHeaders('DELETE', `/api/v1/circles/${layerId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/circles/${layerId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      // Verify it's gone
      const h3 = signedHeaders('GET', '/api/v1/circles', alice.clawId, alice.keys.privateKey)
      const listRes = await request(app).get('/api/v1/circles').set(h3)
      expect(listRes.body.data).toHaveLength(0)
    })

    it('should reject deleting non-existent layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const fakeUuid = '00000000-0000-0000-0000-000000000000'
      const h = signedHeaders('DELETE', `/api/v1/circles/${fakeUuid}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/circles/${fakeUuid}`).set(h)

      expect(res.status).toBe(404)
    })
  })

  describe('Circle friends management', () => {
    it('should add and list friends in a layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      // Create layer
      const createBody = { name: 'besties' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      // Add bob to layer
      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      const addRes = await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      expect(addRes.status).toBe(201)

      // List members
      const h3 = signedHeaders('GET', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey)
      const membersRes = await request(app).get(`/api/v1/circles/${layerId}/friends`).set(h3)

      expect(membersRes.status).toBe(200)
      expect(membersRes.body.data).toHaveLength(1)
      expect(membersRes.body.data[0].clawId).toBe(bob.clawId)
      expect(membersRes.body.data[0].displayName).toBe('Bob')
    })

    it('should reject adding non-friend to layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const createBody = { name: 'test-layer' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      const res = await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_FRIENDS')
    })

    it('should reject duplicate friend in layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const createBody = { name: 'test-layer' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      const h3 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      const res = await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h3).send(addBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE')
    })

    it('should remove friend from layer', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const createBody = { name: 'test-layer' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      const h3 = signedHeaders('DELETE', `/api/v1/circles/${layerId}/friends/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/circles/${layerId}/friends/${bob.clawId}`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data.removed).toBe(true)

      // Verify member list is empty
      const h4 = signedHeaders('GET', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey)
      const membersRes = await request(app).get(`/api/v1/circles/${layerId}/friends`).set(h4)
      expect(membersRes.body.data).toHaveLength(0)
    })
  })

  describe('Circles message visibility', () => {
    it('should send message to layer members only', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)

      // Create layer and add only Bob
      const createBody = { name: 'inner-circle' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      // Send circles message
      const msgBody = {
        blocks: [{ type: 'text', text: 'Inner circle only!' }],
        visibility: 'circles',
        circleNames: ['inner-circle'],
      }
      const h3 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody)
      const res = await request(app).post('/api/v1/messages').set(h3).send(msgBody)

      expect(res.status).toBe(201)
      expect(res.body.data.recipientCount).toBe(1)
      expect(res.body.data.recipients).toEqual([bob.clawId])

      // Bob should see it in inbox
      const h4 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const bobInbox = await request(app).get('/api/v1/inbox').set(h4)
      expect(bobInbox.body.data).toHaveLength(1)
      expect(bobInbox.body.data[0].message.blocks[0].text).toBe('Inner circle only!')

      // Charlie should NOT see it in inbox
      const h5 = signedHeaders('GET', '/api/v1/inbox', charlie.clawId, charlie.keys.privateKey)
      const charlieInbox = await request(app).get('/api/v1/inbox').set(h5)
      expect(charlieInbox.body.data).toHaveLength(0)
    })

    it('should reject circles message without circleNames', async () => {
      const alice = await registerClaw(app, 'Alice')
      const body = {
        blocks: [{ type: 'text', text: 'test' }],
        visibility: 'circles',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(400)
    })

    it('canViewMessage should check circles membership', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)

      // Create layer with only Bob
      const createBody = { name: 'vip' }
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, createBody)
      const createRes = await request(app).post('/api/v1/circles').set(h1).send(createBody)
      const layerId = createRes.body.data.id

      const addBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/circles/${layerId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
      await request(app).post(`/api/v1/circles/${layerId}/friends`).set(h2).send(addBody)

      // Send circles message
      const msgBody = {
        blocks: [{ type: 'text', text: 'VIP only' }],
        visibility: 'circles',
        circleNames: ['vip'],
      }
      const h3 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody)
      const sendRes = await request(app).post('/api/v1/messages').set(h3).send(msgBody)
      const msgId = sendRes.body.data.messageId

      // Bob can view it
      const h4 = signedHeaders('GET', `/api/v1/messages/${msgId}`, bob.clawId, bob.keys.privateKey)
      const bobView = await request(app).get(`/api/v1/messages/${msgId}`).set(h4)
      expect(bobView.status).toBe(200)

      // Charlie cannot view it
      const h5 = signedHeaders('GET', `/api/v1/messages/${msgId}`, charlie.clawId, charlie.keys.privateKey)
      const charlieView = await request(app).get(`/api/v1/messages/${msgId}`).set(h5)
      expect(charlieView.status).toBe(404)

      // Alice (sender) can view it
      const h6 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
      const aliceView = await request(app).get(`/api/v1/messages/${msgId}`).set(h6)
      expect(aliceView.status).toBe(200)
    })

    it('should union friends from multiple circles', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      const dave = await registerClaw(app, 'Dave')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)
      await makeFriends(app, alice, dave)

      // Circle A: Bob, Charlie
      const h1 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, { name: 'layer-a' })
      const la = await request(app).post('/api/v1/circles').set(h1).send({ name: 'layer-a' })
      const layerAId = la.body.data.id

      for (const claw of [bob, charlie]) {
        const addBody = { clawId: claw.clawId }
        const h = signedHeaders('POST', `/api/v1/circles/${layerAId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
        await request(app).post(`/api/v1/circles/${layerAId}/friends`).set(h).send(addBody)
      }

      // Circle B: Charlie, Dave
      const h2 = signedHeaders('POST', '/api/v1/circles', alice.clawId, alice.keys.privateKey, { name: 'layer-b' })
      const lb = await request(app).post('/api/v1/circles').set(h2).send({ name: 'layer-b' })
      const layerBId = lb.body.data.id

      for (const claw of [charlie, dave]) {
        const addBody = { clawId: claw.clawId }
        const h = signedHeaders('POST', `/api/v1/circles/${layerBId}/friends`, alice.clawId, alice.keys.privateKey, addBody)
        await request(app).post(`/api/v1/circles/${layerBId}/friends`).set(h).send(addBody)
      }

      // Send to both circles
      const msgBody = {
        blocks: [{ type: 'text', text: 'Multi-layer!' }],
        visibility: 'circles',
        circleNames: ['layer-a', 'layer-b'],
      }
      const h3 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody)
      const res = await request(app).post('/api/v1/messages').set(h3).send(msgBody)

      // Should be 3 unique recipients: Bob, Charlie, Dave (deduplicated)
      expect(res.status).toBe(201)
      expect(res.body.data.recipientCount).toBe(3)
      const recipients = res.body.data.recipients.sort()
      const expected = [bob.clawId, charlie.clawId, dave.clawId].sort()
      expect(recipients).toEqual(expected)
    })
  })
})
