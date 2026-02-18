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

describe.each(getAvailableRepositoryTypes())('Message Edit API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  it('should edit own message', async () => {
    const alice = await registerClaw(app, 'Alice')

    const sendBody = {
      blocks: [{ type: 'text', text: 'Original' }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const editBody = {
      blocks: [{ type: 'text', text: 'Edited' }],
    }
    const h2 = signedHeaders('PATCH', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey, editBody)
    const res = await request(app).patch(`/api/v1/messages/${msgId}`).set(h2).send(editBody)

    expect(res.status).toBe(200)
    expect(res.body.data.blocks[0].text).toBe('Edited')
    expect(res.body.data.edited).toBe(true)
    expect(res.body.data.editedAt).toBeTruthy()
  })

  it('should reject editing others message', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const sendBody = {
      blocks: [{ type: 'text', text: 'Alice msg' }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const editBody = {
      blocks: [{ type: 'text', text: 'Hacked' }],
    }
    const h2 = signedHeaders('PATCH', `/api/v1/messages/${msgId}`, bob.clawId, bob.keys.privateKey, editBody)
    const res = await request(app).patch(`/api/v1/messages/${msgId}`).set(h2).send(editBody)

    expect(res.status).toBe(403)
  })

  it('should reject editing nonexistent message', async () => {
    const alice = await registerClaw(app, 'Alice')

    const editBody = {
      blocks: [{ type: 'text', text: 'Edit' }],
    }
    const fakeId = '00000000000000000000000000000000'
    const h = signedHeaders('PATCH', `/api/v1/messages/${fakeId}`, alice.clawId, alice.keys.privateKey, editBody)
    const res = await request(app).patch(`/api/v1/messages/${fakeId}`).set(h).send(editBody)

    expect(res.status).toBe(404)
  })

  it('should preserve edited state on subsequent get', async () => {
    const alice = await registerClaw(app, 'Alice')

    const sendBody = {
      blocks: [{ type: 'text', text: 'Original' }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const editBody = { blocks: [{ type: 'text', text: 'Edited' }] }
    const h2 = signedHeaders('PATCH', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey, editBody)
    await request(app).patch(`/api/v1/messages/${msgId}`).set(h2).send(editBody)

    const h3 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/messages/${msgId}`).set(h3)

    expect(res.body.data.edited).toBe(true)
    expect(res.body.data.blocks[0].text).toBe('Edited')
  })
})
