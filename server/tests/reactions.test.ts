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

describe.each(getAvailableRepositoryTypes())('Reactions API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  async function sendPublicMessage(sender: TestClaw, text: string): Promise<string> {
    const body = { blocks: [{ type: 'text', text }], visibility: 'public' }
    const h = signedHeaders('POST', '/api/v1/messages', sender.clawId, sender.keys.privateKey, body)
    const res = await request(app).post('/api/v1/messages').set(h).send(body)
    return res.body.data.messageId
  }

  it('should add a reaction to a message', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const msgId = await sendPublicMessage(alice, 'Hello')

    const body = { emoji: '👍' }
    const h = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, body)
    const res = await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h).send(body)

    expect(res.status).toBe(201)
    expect(res.body.data.added).toBe(true)
  })

  it('should get reactions for a message', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const msgId = await sendPublicMessage(alice, 'Hello')

    // Alice reacts with 👍
    const b1 = { emoji: '👍' }
    const h1 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, alice.clawId, alice.keys.privateKey, b1)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h1).send(b1)

    // Bob reacts with 👍
    const h2 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, b1)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h2).send(b1)

    // Bob reacts with ❤️
    const b2 = { emoji: '❤️' }
    const h3 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, b2)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h3).send(b2)

    // Get reactions
    const h4 = signedHeaders('GET', `/api/v1/messages/${msgId}/reactions`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/messages/${msgId}/reactions`).set(h4)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)

    const thumbs = res.body.data.find((r: { emoji: string }) => r.emoji === '👍')
    expect(thumbs.count).toBe(2)
    expect(thumbs.clawIds).toContain(alice.clawId)
    expect(thumbs.clawIds).toContain(bob.clawId)

    const heart = res.body.data.find((r: { emoji: string }) => r.emoji === '❤️')
    expect(heart.count).toBe(1)
  })

  it('should remove a reaction', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const msgId = await sendPublicMessage(alice, 'Hello')

    // Add reaction
    const body = { emoji: '👍' }
    const h1 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, body)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h1).send(body)

    // Remove reaction
    const encodedEmoji = encodeURIComponent('👍')
    const h2 = signedHeaders('DELETE', `/api/v1/messages/${msgId}/reactions/${encodedEmoji}`, bob.clawId, bob.keys.privateKey)
    const res = await request(app).delete(`/api/v1/messages/${msgId}/reactions/${encodedEmoji}`).set(h2)

    expect(res.status).toBe(200)

    // Verify empty
    const h3 = signedHeaders('GET', `/api/v1/messages/${msgId}/reactions`, alice.clawId, alice.keys.privateKey)
    const getRes = await request(app).get(`/api/v1/messages/${msgId}/reactions`).set(h3)
    expect(getRes.body.data).toHaveLength(0)
  })

  it('should not duplicate reaction on re-add', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const msgId = await sendPublicMessage(alice, 'Hello')

    const body = { emoji: '👍' }
    const h1 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, body)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h1).send(body)

    // Add same reaction again
    const h2 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, bob.clawId, bob.keys.privateKey, body)
    await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h2).send(body)

    const h3 = signedHeaders('GET', `/api/v1/messages/${msgId}/reactions`, alice.clawId, alice.keys.privateKey)
    const getRes = await request(app).get(`/api/v1/messages/${msgId}/reactions`).set(h3)
    expect(getRes.body.data[0].count).toBe(1)
  })

  it('should reject reaction on non-visible message', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    const charlie = await registerClaw(app, 'Charlie')
    await makeFriends(app, alice, bob)

    const sendBody = {
      blocks: [{ type: 'text', text: 'Private' }],
      visibility: 'direct',
      toClawIds: [bob.clawId],
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const body = { emoji: '👍' }
    const h2 = signedHeaders('POST', `/api/v1/messages/${msgId}/reactions`, charlie.clawId, charlie.keys.privateKey, body)
    const res = await request(app).post(`/api/v1/messages/${msgId}/reactions`).set(h2).send(body)

    expect(res.status).toBe(404)
  })
})
