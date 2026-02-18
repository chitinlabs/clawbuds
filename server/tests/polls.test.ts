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

describe.each(getAvailableRepositoryTypes())('Polls API [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']

  beforeEach(() => {
    tc = createTestContext({ repositoryType })
    app = tc.app
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  it('should create poll via message with poll block', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const body = {
      blocks: [
        { type: 'text', text: 'Vote please!' },
        { type: 'poll', question: 'Best color?', options: ['Red', 'Blue', 'Green'] },
      ],
      visibility: 'public',
    }
    const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
    const res = await request(app).post('/api/v1/messages').set(h).send(body)

    expect(res.status).toBe(201)

    // Verify the message contains a poll block with pollId
    const msgId = res.body.data.messageId
    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const msgRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)

    const pollBlock = msgRes.body.data.blocks.find((b: { type: string }) => b.type === 'poll')
    expect(pollBlock).toBeTruthy()
    expect(pollBlock.pollId).toBeTruthy()
    expect(pollBlock.question).toBe('Best color?')
    expect(pollBlock.options).toEqual(['Red', 'Blue', 'Green'])
  })

  it('should vote on a poll', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    // Create poll
    const sendBody = {
      blocks: [{ type: 'poll', question: 'Yes or No?', options: ['Yes', 'No'] }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    // Get pollId from message
    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const msgRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)
    const pollId = msgRes.body.data.blocks[0].pollId

    // Vote
    const voteBody = { optionIndex: 0 }
    const h3 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, bob.clawId, bob.keys.privateKey, voteBody)
    const res = await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h3).send(voteBody)

    expect(res.status).toBe(200)
    expect(res.body.data.voted).toBe(true)
  })

  it('should get poll results', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    // Create poll
    const sendBody = {
      blocks: [{ type: 'poll', question: 'Pick one', options: ['A', 'B', 'C'] }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const msgRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)
    const pollId = msgRes.body.data.blocks[0].pollId

    // Alice votes for A, Bob votes for B
    const v1 = { optionIndex: 0 }
    const h3 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, alice.clawId, alice.keys.privateKey, v1)
    await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h3).send(v1)

    const v2 = { optionIndex: 1 }
    const h4 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, bob.clawId, bob.keys.privateKey, v2)
    await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h4).send(v2)

    // Get results
    const h5 = signedHeaders('GET', `/api/v1/polls/${pollId}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/polls/${pollId}`).set(h5)

    expect(res.status).toBe(200)
    expect(res.body.data.totalVotes).toBe(2)
    expect(res.body.data.votes['0']).toContain(alice.clawId)
    expect(res.body.data.votes['1']).toContain(bob.clawId)
  })

  it('should reject invalid option index', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const sendBody = {
      blocks: [{ type: 'poll', question: 'Q?', options: ['A', 'B'] }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const msgRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)
    const pollId = msgRes.body.data.blocks[0].pollId

    const voteBody = { optionIndex: 5 }
    const h3 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, bob.clawId, bob.keys.privateKey, voteBody)
    const res = await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h3).send(voteBody)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_OPTION')
  })

  it('should replace vote on re-vote', async () => {
    const alice = await registerClaw(app, 'Alice')
    const bob = await registerClaw(app, 'Bob')
    await makeFriends(app, alice, bob)

    const sendBody = {
      blocks: [{ type: 'poll', question: 'Q?', options: ['A', 'B'] }],
      visibility: 'public',
    }
    const h1 = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, sendBody)
    const sendRes = await request(app).post('/api/v1/messages').set(h1).send(sendBody)
    const msgId = sendRes.body.data.messageId

    const h2 = signedHeaders('GET', `/api/v1/messages/${msgId}`, alice.clawId, alice.keys.privateKey)
    const msgRes = await request(app).get(`/api/v1/messages/${msgId}`).set(h2)
    const pollId = msgRes.body.data.blocks[0].pollId

    // Vote for A
    const v1 = { optionIndex: 0 }
    const h3 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, bob.clawId, bob.keys.privateKey, v1)
    await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h3).send(v1)

    // Change to B
    const v2 = { optionIndex: 1 }
    const h4 = signedHeaders('POST', `/api/v1/polls/${pollId}/vote`, bob.clawId, bob.keys.privateKey, v2)
    await request(app).post(`/api/v1/polls/${pollId}/vote`).set(h4).send(v2)

    // Check results
    const h5 = signedHeaders('GET', `/api/v1/polls/${pollId}`, alice.clawId, alice.keys.privateKey)
    const res = await request(app).get(`/api/v1/polls/${pollId}`).set(h5)

    expect(res.body.data.totalVotes).toBe(1)
    expect(res.body.data.votes['1']).toContain(bob.clawId)
    expect(res.body.data.votes['0']).toBeUndefined()
  })
})
