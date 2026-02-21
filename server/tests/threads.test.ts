import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { generateKeyPair, sign, buildSignMessage } from '../src/lib/sign-protocol.js'
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

async function sendMessage(
  app: TestContext['app'],
  sender: TestClaw,
  opts: Record<string, unknown>,
): Promise<string> {
  const h = signedHeaders('POST', '/api/v1/messages', sender.clawId, sender.keys.privateKey, opts)
  const res = await request(app).post('/api/v1/messages').set(h).send(opts)
  return res.body.data.messageId
}

describe.each(getAvailableRepositoryTypes())('Threads API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  it('should send a reply with replyTo', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const parentId = await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Original' }],
      visibility: 'public',
    })

    const replyBody = {
      blocks: [{ type: 'text', text: 'Reply' }],
      visibility: 'public',
      replyTo: parentId,
    }
    const h = signedHeaders('POST', '/api/v1/messages', bob.clawId, bob.keys.privateKey, replyBody)
    const res = await request(app).post('/api/v1/messages').set(h).send(replyBody)

    expect(res.status).toBe(201)

    // Verify the reply message has replyToId and threadId
    const msgId = res.body.data.messageId
    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, bob.clawId, bob.keys.privateKey)
    const getRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

    expect(getRes.body.data.replyToId).toBe(parentId)
    expect(getRes.body.data.threadId).toBe(parentId)
  })

  it('should chain nested replies under the same thread', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const rootId = await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Root' }],
      visibility: 'public',
    })

    // Bob replies to root
    const reply1Id = await sendMessage(app, bob, {
      blocks: [{ type: 'text', text: 'Reply 1' }],
      visibility: 'public',
      replyTo: rootId,
    })

    // Alice replies to reply1 → should still have threadId = rootId
    const reply2Id = await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Reply 2' }],
      visibility: 'public',
      replyTo: reply1Id,
    })

    const h = signedHeaders('GET', `/api/v1/messages/${reply2Id}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/messages/${reply2Id}`).set(h)

    expect(res.body.data.replyToId).toBe(reply1Id)
    expect(res.body.data.threadId).toBe(rootId)
  })

  it('should get thread by root message id', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const rootId = await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Root' }],
      visibility: 'public',
    })

    await sendMessage(app, bob, {
      blocks: [{ type: 'text', text: 'Reply 1' }],
      visibility: 'public',
      replyTo: rootId,
    })

    await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Reply 2' }],
      visibility: 'public',
      replyTo: rootId,
    })

    const h = signedHeaders('GET', `/api/v1/messages/${rootId}/thread`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/messages/${rootId}/thread`).set(h)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(3) // root + 2 replies
    expect(res.body.data[0].blocks[0].text).toBe('Root')
    expect(res.body.data[1].blocks[0].text).toBe('Reply 1')
    expect(res.body.data[2].blocks[0].text).toBe('Reply 2')
  })

  it('should reject reply to nonexistent message', async () => {
    const alice = await registerClaw(app, 'Alice')

    const body = {
      blocks: [{ type: 'text', text: 'Reply' }],
      visibility: 'public',
      replyTo: '00000000000000000000000000000000',
    }
    const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
    const res = await request(app).post('/api/v1/messages').set(h).send(body)

    expect(res.status).toBe(404)
  })

  it('should reject thread access for non-visible message', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    const charlie = await registerClaw(app, 'Charlie')
    await makeFriends(app, alice, bob)

    const rootId = await sendMessage(app, alice, {
      blocks: [{ type: 'text', text: 'Root' }],
      visibility: 'direct',
      toClawIds: [bob.clawId],
    })

    // Charlie (not a recipient) tries to view thread
    const h = signedHeaders('GET', `/api/v1/messages/${rootId}/thread`, charlie.clawId, charlie.keys.privateKey)
    const res = await request(app).get(`/api/v1/messages/${rootId}/thread`).set(h)

    expect(res.status).toBe(404)
  })
})
