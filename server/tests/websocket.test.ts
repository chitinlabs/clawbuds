import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { WebSocket } from 'ws'
import { generateKeyPair, sign, buildSignMessage } from '../src/lib/sign-protocol.js'
import { createTestContext, destroyTestContext, getAvailableRepositoryTypes, type TestContext } from './e2e/helpers.js'
import { WebSocketManager } from '../src/websocket/manager.js'
import type { Server } from 'node:http'

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

function wsUrl(server: Server, claw: TestClaw): string {
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('Server not listening')
  const timestamp = String(Date.now())
  const message = buildSignMessage('CONNECT', '/ws', timestamp, '')
  const signature = sign(message, claw.keys.privateKey)
  return `ws://127.0.0.1:${addr.port}/ws?clawId=${claw.clawId}&timestamp=${timestamp}&signature=${signature}`
}

function connectWs(server: Server, claw: TestClaw): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(server, claw))
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function waitForMessage(ws: WebSocket, timeout = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeout)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(JSON.parse(data.toString()))
    })
  })
}

function waitForClose(ws: WebSocket, timeout = 2000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for WS close')), timeout)
    ws.on('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

function collectMessages(ws: WebSocket, count: number, timeout = 2000): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const msgs: Record<string, unknown>[] = []
    const timer = setTimeout(() => {
      // Return what we have if timeout (for "no messages" tests)
      resolve(msgs)
    }, timeout)
    const handler = (data: Buffer | string) => {
      msgs.push(JSON.parse(data.toString()))
      if (msgs.length >= count) {
        clearTimeout(timer)
        ws.off('message', handler)
        resolve(msgs)
      }
    }
    ws.on('message', handler)
  })
}

describe.each(getAvailableRepositoryTypes())('WebSocket [%s]', (repositoryType) => {
  let tc: TestContext
  let app: TestContext['app']
  let server: Server
  let wsManager: WebSocketManager
  const openWs: WebSocket[] = []

  beforeEach(async () => {
    tc = createTestContext({ repositoryType })
    app = tc.app

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })

    wsManager = new WebSocketManager(server, tc.ctx.clawService!, tc.ctx.inboxService!, tc.ctx.eventBus!)
  })

  afterEach(async () => {
    for (const ws of openWs) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
    openWs.length = 0
    wsManager.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    destroyTestContext(tc)
  })

  async function trackWs(server: Server, claw: TestClaw): Promise<WebSocket> {
    const ws = await connectWs(server, claw)
    openWs.push(ws)
    return ws
  }

  describe('Connection & Auth', () => {
    it('should connect with valid auth', async () => {
      const alice = await registerClaw(app, 'Alice')
      const ws = await trackWs(server, alice)
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })

    it('should reject connection without auth params', async () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('no addr')

      await expect(
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${(addr as { port: number }).port}/ws`)
          openWs.push(ws)
          ws.on('open', () => reject(new Error('should not connect')))
          ws.on('error', () => resolve())
        }),
      ).resolves.toBeUndefined()
    })

    it('should reject connection with wrong signature', async () => {
      const alice = await registerClaw(app, 'Alice')
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('no addr')

      const timestamp = String(Date.now())
      const url = `ws://127.0.0.1:${(addr as { port: number }).port}/ws?clawId=${alice.clawId}&timestamp=${timestamp}&signature=deadbeef`

      await expect(
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(url)
          openWs.push(ws)
          ws.on('open', () => reject(new Error('should not connect')))
          ws.on('error', () => resolve())
        }),
      ).resolves.toBeUndefined()
    })

    it('should reject connection with expired timestamp', async () => {
      const alice = await registerClaw(app, 'Alice')
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('no addr')

      const timestamp = String(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      const message = buildSignMessage('CONNECT', '/ws', timestamp, '')
      const signature = sign(message, alice.keys.privateKey)
      const url = `ws://127.0.0.1:${(addr as { port: number }).port}/ws?clawId=${alice.clawId}&timestamp=${timestamp}&signature=${signature}`

      await expect(
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(url)
          openWs.push(ws)
          ws.on('open', () => reject(new Error('should not connect')))
          ws.on('error', () => resolve())
        }),
      ).resolves.toBeUndefined()
    })

    it('should replace previous connection for same clawId', async () => {
      const alice = await registerClaw(app, 'Alice')
      const ws1 = await trackWs(server, alice)
      const closePromise = waitForClose(ws1)
      const ws2 = await trackWs(server, alice)

      const code = await closePromise
      expect(code).toBe(4001)
      expect(ws2.readyState).toBe(WebSocket.OPEN)
    })
  })

  describe('Real-time Events', () => {
    it('should receive message.new when friend sends public message', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      const ws = await trackWs(server, bob)
      const msgPromise = waitForMessage(ws)

      // Alice sends a public message
      const body = { blocks: [{ type: 'text', text: 'Hello via WS!' }], visibility: 'public' }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h).send(body)

      const msg = await msgPromise
      expect(msg.type).toBe('message.new')
      expect(msg.seq).toBe(1)
      expect((msg.data as Record<string, unknown>).message).toBeDefined()
      const innerMsg = (msg.data as Record<string, Record<string, unknown>>).message
      expect(innerMsg.fromClawId).toBe(alice.clawId)
    })

    it('should receive friend.request when someone sends request', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const ws = await trackWs(server, bob)
      const msgPromise = waitForMessage(ws)

      // Alice sends friend request to Bob
      const body = { clawId: bob.clawId }
      const h = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/friends/request').set(h).send(body)

      const msg = await msgPromise
      expect(msg.type).toBe('friend.request')
      expect((msg.data as Record<string, unknown>).requesterId).toBe(alice.clawId)
      expect((msg.data as Record<string, unknown>).status).toBe('pending')
    })

    it('should receive friend.accepted when request is accepted', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Alice sends friend request
      const reqBody = { clawId: bob.clawId }
      const h1 = signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, reqBody)
      const reqRes = await request(app).post('/api/v1/friends/request').set(h1).send(reqBody)

      // Both connect
      const wsAlice = await trackWs(server, alice)
      const wsBob = await trackWs(server, bob)
      const aliceMsgPromise = waitForMessage(wsAlice)
      const bobMsgPromise = waitForMessage(wsBob)

      // Bob accepts
      const acceptBody = { friendshipId: reqRes.body.data.id }
      const h2 = signedHeaders('POST', '/api/v1/friends/accept', bob.clawId, bob.keys.privateKey, acceptBody)
      await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

      const aliceMsg = await aliceMsgPromise
      const bobMsg = await bobMsgPromise
      expect(aliceMsg.type).toBe('friend.accepted')
      expect(bobMsg.type).toBe('friend.accepted')
      expect((aliceMsg.data as Record<string, unknown>).status).toBe('accepted')
    })

    it('should not send events to unrelated users', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')
      await makeFriends(app, alice, bob)

      const wsCharlie = await trackWs(server, charlie)
      const msgs = collectMessages(wsCharlie, 1, 500)

      // Alice sends a message to Bob only
      const body = { blocks: [{ type: 'text', text: 'Just for Bob' }], visibility: 'public' }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h).send(body)

      const result = await msgs
      expect(result).toHaveLength(0)
    })
  })

  describe('Seq Catch-up', () => {
    it('should catch up all messages from seq 0', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      // Send 3 messages while Bob is offline
      for (const text of ['msg1', 'msg2', 'msg3']) {
        const body = { blocks: [{ type: 'text', text }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      // Bob connects and requests catch-up
      const ws = await trackWs(server, bob)
      const msgs = collectMessages(ws, 3)

      ws.send(JSON.stringify({ type: 'catch-up', lastSeq: 0 }))

      const result = await msgs
      expect(result).toHaveLength(3)
      expect(result[0].seq).toBe(1)
      expect(result[1].seq).toBe(2)
      expect(result[2].seq).toBe(3)
    })

    it('should catch up only messages after lastSeq', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      for (const text of ['msg1', 'msg2', 'msg3']) {
        const body = { blocks: [{ type: 'text', text }], visibility: 'public' as const }
        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
        await request(app).post('/api/v1/messages').set(h).send(body)
      }

      const ws = await trackWs(server, bob)
      const msgs = collectMessages(ws, 2)

      ws.send(JSON.stringify({ type: 'catch-up', lastSeq: 1 }))

      const result = await msgs
      expect(result).toHaveLength(2)
      expect(result[0].seq).toBe(2)
      expect(result[1].seq).toBe(3)
    })

    it('should return no messages when already caught up', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      await makeFriends(app, alice, bob)

      // Send 1 message
      const body = { blocks: [{ type: 'text', text: 'only one' }], visibility: 'public' as const }
      const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, body)
      await request(app).post('/api/v1/messages').set(h).send(body)

      const ws = await trackWs(server, bob)
      const msgs = collectMessages(ws, 1, 500)

      ws.send(JSON.stringify({ type: 'catch-up', lastSeq: 1 }))

      const result = await msgs
      expect(result).toHaveLength(0)
    })
  })
})
