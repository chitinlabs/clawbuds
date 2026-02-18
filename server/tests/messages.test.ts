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

describe.each(getAvailableRepositoryTypes())('Messages API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('POST /api/v1/messages', () => {
    it('should send a public text message to all friends', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)

      const body = {
        blocks: [{ type: 'text', text: 'Hello everyone!' }],
        visibility: 'public',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.recipientCount).toBe(2)
      expect(res.body.data.recipients).toContain(bob.clawId)
      expect(res.body.data.recipients).toContain(charlie.clawId)
      expect(res.body.data.messageId).toBeTruthy()
    })

    it('should send a direct message to specific friend', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)

      const body = {
        blocks: [{ type: 'text', text: 'Private message' }],
        visibility: 'direct',
        toClawIds: [bob.clawId],
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.recipientCount).toBe(1)
      expect(res.body.data.recipients).toEqual([bob.clawId])
    })

    it('should reject direct message to non-friend', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = {
        blocks: [{ type: 'text', text: 'Hi' }],
        visibility: 'direct',
        toClawIds: [bob.clawId],
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_FRIENDS')
    })

    it('should reject direct message without toClawIds', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = {
        blocks: [{ type: 'text', text: 'Hi' }],
        visibility: 'direct',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(400)
    })

    it('should send message with link block', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [
          { type: 'text', text: 'Check this out:' },
          { type: 'link', url: 'https://example.com' },
        ],
        visibility: 'public',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(201)
    })

    it('should reject empty blocks', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = {
        blocks: [],
        visibility: 'public',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(400)
    })

    it('should send public message with no friends (0 recipients)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = {
        blocks: [{ type: 'text', text: 'Hello to nobody' }],
        visibility: 'public',
      }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/messages').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.recipientCount).toBe(0)
    })
  })

  describe('GET /api/v1/messages/:id', () => {
    it('should get message by id (sender)', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [{ type: 'text', text: 'Test message' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.blocks[0].text).toBe('Test message')
    })

    it('should get message by id (recipient friend)', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [{ type: 'text', text: 'For Bob' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(200)
    })

    it('should reject access by non-friend to public message', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [{ type: 'text', text: 'Only for friends' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, charlie.clawId, charlie.keys.privateKey)
      const res = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(404)
    })

    it('should reject access to direct message by non-recipient', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)

      const body = {
        blocks: [{ type: 'text', text: 'Only for Bob' }],
        visibility: 'direct',
        toClawIds: [bob.clawId],
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, charlie.clawId, charlie.keys.privateKey)
      const res = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/v1/messages/:id', () => {
    it('should delete own message', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = {
        blocks: [{ type: 'text', text: 'To delete' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('DELETE', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
    })

    it('should reject deleting others message', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [{ type: 'text', text: 'Alice message' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      const sendRes = await request(app).post('/api/v1/messages').set(h1).send(body)

      const msgId = sendRes.body.data.messageId
      const h2 = signedHeaders('DELETE', `/api/v1/messages/${msgId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).delete(`/api/v1/messages/${msgId}`).set(h2)

      expect(res.status).toBe(403)
    })
  })
})

describe.each(getAvailableRepositoryTypes())('Inbox API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('GET /api/v1/inbox', () => {
    it('should return inbox entries', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = {
        blocks: [{ type: 'text', text: 'Hello Bob' }],
        visibility: 'public',
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h1).send(body)

      const h2 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox').set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].message.fromClawId).toBe(alice.clawId)
      expect(res.body.data[0].message.fromDisplayName).toBe('Alice')
      expect(res.body.data[0].message.blocks[0].text).toBe('Hello Bob')
      expect(res.body.data[0].seq).toBe(1)
      expect(res.body.data[0].status).toBe('unread')
    })

    it('should filter by afterSeq', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      // Send 3 messages
      for (const text of ['msg1', 'msg2', 'msg3']) {
        const body = { blocks: [{ type: 'text', text }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox?status=all&afterSeq=1').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data[0].seq).toBe(2)
      expect(res.body.data[1].seq).toBe(3)
    })

    it('should respect limit', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      for (const text of ['msg1', 'msg2', 'msg3']) {
        const body = { blocks: [{ type: 'text', text }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox?status=all&limit=2').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })

    it('should not show messages sent by self', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = { blocks: [{ type: 'text', text: 'My own msg' }], visibility: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h1).send(body)

      // Alice's own inbox should NOT have her own message
      const h2 = signedHeaders('GET', '/api/v1/inbox', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox?status=all').set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
    })
  })

  describe('POST /api/v1/inbox/ack', () => {
    it('should acknowledge inbox entries', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = { blocks: [{ type: 'text', text: 'Hello' }], visibility: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h1).send(body)

      // Get inbox to know entry IDs
      const h2 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const inboxRes = await request(app).get('/api/v1/inbox').set(h2)
      const entryId = inboxRes.body.data[0].id

      // Ack
      const ackBody = { entryIds: [entryId] }
      const h3 = signedHeaders('POST', '/api/v1/inbox/ack', bob.clawId, bob.keys.privateKey, ackBody)
      const res = await request(app).post('/api/v1/inbox/ack').set(h3).send(ackBody)

      expect(res.status).toBe(200)
      expect(res.body.data.acknowledged).toBe(1)

      // Verify entry is no longer unread
      const h4 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const unreadRes = await request(app).get('/api/v1/inbox').set(h4)
      expect(unreadRes.body.data).toHaveLength(0)
    })
  })

  describe('GET /api/v1/inbox/count', () => {
    it('should return unread count', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      for (const text of ['msg1', 'msg2']) {
        const body = { blocks: [{ type: 'text', text }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/inbox/count', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox/count').set(h)

      expect(res.status).toBe(200)
      expect(res.body.data.unread).toBe(2)
    })

    it('should decrease after ack', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const body = { blocks: [{ type: 'text', text: 'Hello' }], visibility: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h1).send(body)

      // Ack the entry
      const h2 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const inboxRes = await request(app).get('/api/v1/inbox').set(h2)
      const entryId = inboxRes.body.data[0].id

      const ackBody = { entryIds: [entryId] }
      const h3 = signedHeaders('POST', '/api/v1/inbox/ack', bob.clawId, bob.keys.privateKey, ackBody)
      await request(app).post('/api/v1/inbox/ack').set(h3).send(ackBody)

      // Count should be 0
      const h4 = signedHeaders('GET', '/api/v1/inbox/count', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox/count').set(h4)
      expect(res.body.data.unread).toBe(0)
    })
  })

  describe('Seq increments correctly', () => {
    it('should increment seq per recipient', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      // Send 3 messages
      for (let i = 1; i <= 3; i++) {
        const body = { blocks: [{ type: 'text', text: `msg${i}` }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      const h = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox?status=all').set(h)

      expect(res.body.data).toHaveLength(3)
      expect(res.body.data[0].seq).toBe(1)
      expect(res.body.data[1].seq).toBe(2)
      expect(res.body.data[2].seq).toBe(3)
    })

    it('should have independent seq per user', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)
      await makeFriends(app, alice, charlie)
      await makeFriends(app, bob, charlie)

      // Alice sends 2 messages to all
      for (let i = 1; i <= 2; i++) {
        const body = { blocks: [{ type: 'text', text: `alice-${i}` }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      // Bob sends 1 message to all
      const body = { blocks: [{ type: 'text', text: 'bob-1' }], visibility: 'public' as const }
      const h1 = signedHeaders('POST', '/api/v1/messages', bob.clawId, bob.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h1).send(body)

      // Charlie should have seq 1,2,3 (2 from Alice + 1 from Bob)
      const h2 = signedHeaders('GET', '/api/v1/inbox', charlie.clawId, charlie.keys.privateKey)
      const res = await request(app).get('/api/v1/inbox?status=all').set(h2)

      expect(res.body.data).toHaveLength(3)
      expect(res.body.data[0].seq).toBe(1)
      expect(res.body.data[1].seq).toBe(2)
      expect(res.body.data[2].seq).toBe(3)
    })
  })

  describe('Full E2E flow', () => {
    it('should complete register → friend → send → inbox → ack', async () => {
      // Register
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Become friends
      await makeFriends(app, alice, bob)

      // Alice sends message
      const msgBody = {
        blocks: [{ type: 'text', text: '周末有空吗？' }],
        visibility: 'direct',
        toClawIds: [bob.clawId],
      }
      const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody)
      await request(app).post('/api/v1/messages').set(h1).send(msgBody)

      // Bob checks inbox
      const h2 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const inboxRes = await request(app).get('/api/v1/inbox').set(h2)

      expect(inboxRes.body.data).toHaveLength(1)
      expect(inboxRes.body.data[0].message.blocks[0].text).toBe('周末有空吗？')
      expect(inboxRes.body.data[0].message.fromDisplayName).toBe('Alice')

      // Bob checks unread count
      const h3 = signedHeaders('GET', '/api/v1/inbox/count', bob.clawId, bob.keys.privateKey)
      const countRes = await request(app).get('/api/v1/inbox/count').set(h3)
      expect(countRes.body.data.unread).toBe(1)

      // Bob acks
      const ackBody = { entryIds: [inboxRes.body.data[0].id] }
      const h4 = signedHeaders('POST', '/api/v1/inbox/ack', bob.clawId, bob.keys.privateKey, ackBody)
      await request(app).post('/api/v1/inbox/ack').set(h4).send(ackBody)

      // Verify unread is 0
      const h5 = signedHeaders('GET', '/api/v1/inbox/count', bob.clawId, bob.keys.privateKey)
      const finalCount = await request(app).get('/api/v1/inbox/count').set(h5)
      expect(finalCount.body.data.unread).toBe(0)
    })
  })
})
