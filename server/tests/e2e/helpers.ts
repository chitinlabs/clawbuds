/**
 * E2E Test Helpers
 *
 * Shared utilities for end-to-end testing of ClawBuds API.
 * Provides authenticated client simulation, friendship setup,
 * group management, and webhook HMAC signing.
 */

import request from 'supertest'
import type { Express } from 'express'
import type Database from 'better-sqlite3'
import {
  generateKeyPair,
  sign,
  buildSignMessage,
  ed25519PrivateToX25519,
  x25519GetPublicKey,
  x25519SharedSecret,
  deriveSessionKey,
  aesEncrypt,
  aesDecrypt,
} from '@clawbuds/shared'
import { createApp } from '../../src/app.js'
import { createTestDatabase } from '../../src/db/database.js'
import { WebhookService } from '../../src/services/webhook.service.js'

// --- Types ---

export interface TestClaw {
  clawId: string
  displayName: string
  keys: ReturnType<typeof generateKeyPair>
  x25519Private: string
  x25519Public: string
}

export interface TestContext {
  db: Database.Database
  app: Express
  ctx: ReturnType<typeof createApp>['ctx']
}

// --- Context Setup ---

export function createTestContext(): TestContext {
  const db = createTestDatabase()
  const { app, ctx } = createApp(db)
  return { db, app, ctx }
}

export function destroyTestContext(tc: TestContext): void {
  tc.db.close()
}

// --- Auth Helpers ---

export function signedHeaders(
  method: string,
  path: string,
  clawId: string,
  privateKey: string,
  body?: Record<string, unknown> | unknown[],
): Record<string, string> {
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

export async function registerClaw(
  app: Express,
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const x25519Private = ed25519PrivateToX25519(keys.privateKey)
  const x25519Public = x25519GetPublicKey(x25519Private)

  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })

  if (!res.body.data?.clawId) {
    throw new Error(`Registration failed for ${name}: ${JSON.stringify(res.body)}`)
  }

  return {
    clawId: res.body.data.clawId,
    displayName: name,
    keys,
    x25519Private,
    x25519Public,
  }
}

// --- Friendship Helpers ---

export async function makeFriends(
  app: Express,
  userA: TestClaw,
  userB: TestClaw,
): Promise<string> {
  const friendBody = { clawId: userB.clawId }
  const h1 = signedHeaders(
    'POST',
    '/api/v1/friends/request',
    userA.clawId,
    userA.keys.privateKey,
    friendBody,
  )
  const friendReq = await request(app)
    .post('/api/v1/friends/request')
    .set(h1)
    .send(friendBody)

  const friendshipId = friendReq.body.data.id

  const acceptBody = { friendshipId }
  const h2 = signedHeaders(
    'POST',
    '/api/v1/friends/accept',
    userB.clawId,
    userB.keys.privateKey,
    acceptBody,
  )
  await request(app).post('/api/v1/friends/accept').set(h2).send(acceptBody)

  return friendshipId
}

// --- E2EE Helpers ---

export async function registerE2eeKey(
  app: Express,
  user: TestClaw,
): Promise<void> {
  const body = { x25519PublicKey: user.x25519Public }
  const h = signedHeaders(
    'POST',
    '/api/v1/e2ee/keys',
    user.clawId,
    user.keys.privateKey,
    body,
  )
  const res = await request(app).post('/api/v1/e2ee/keys').set(h).send(body)

  if (res.status !== 201) {
    throw new Error(`E2EE key registration failed: ${JSON.stringify(res.body)}`)
  }
}

export async function encryptMessage(
  senderPrivateX25519: string,
  recipientPublicX25519: string,
  plaintext: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const shared = x25519SharedSecret(senderPrivateX25519, recipientPublicX25519)
  const sessionKey = await deriveSessionKey(shared, 'e2ee-session')
  return aesEncrypt(sessionKey, plaintext)
}

export async function decryptMessage(
  recipientPrivateX25519: string,
  senderPublicX25519: string,
  ciphertext: string,
  nonce: string,
): Promise<string> {
  const shared = x25519SharedSecret(recipientPrivateX25519, senderPublicX25519)
  const sessionKey = await deriveSessionKey(shared, 'e2ee-session')
  return aesDecrypt(sessionKey, ciphertext, nonce)
}

// --- Group Helpers ---

export async function createGroup(
  app: Express,
  owner: TestClaw,
  options: {
    name: string
    type?: 'private' | 'public'
    encrypted?: boolean
    maxMembers?: number
  },
): Promise<string> {
  const body = {
    name: options.name,
    type: options.type || 'private',
    encrypted: options.encrypted || false,
    maxMembers: options.maxMembers,
  }
  const h = signedHeaders(
    'POST',
    '/api/v1/groups',
    owner.clawId,
    owner.keys.privateKey,
    body,
  )
  const res = await request(app).post('/api/v1/groups').set(h).send(body)

  if (res.status !== 201) {
    throw new Error(`Group creation failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data.id
}

export async function inviteToGroup(
  app: Express,
  groupId: string,
  inviter: TestClaw,
  invitee: TestClaw,
): Promise<void> {
  const inviteBody = { clawId: invitee.clawId }
  const h = signedHeaders(
    'POST',
    `/api/v1/groups/${groupId}/invite`,
    inviter.clawId,
    inviter.keys.privateKey,
    inviteBody,
  )
  const res = await request(app)
    .post(`/api/v1/groups/${groupId}/invite`)
    .set(h)
    .send(inviteBody)

  if (res.status !== 201) {
    throw new Error(`Invitation failed: ${JSON.stringify(res.body)}`)
  }
}

export async function joinGroup(
  app: Express,
  groupId: string,
  user: TestClaw,
): Promise<void> {
  const h = signedHeaders(
    'POST',
    `/api/v1/groups/${groupId}/join`,
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app)
    .post(`/api/v1/groups/${groupId}/join`)
    .set(h)

  if (res.status !== 200) {
    throw new Error(`Join group failed: ${JSON.stringify(res.body)}`)
  }
}

export async function sendGroupMessage(
  app: Express,
  groupId: string,
  sender: TestClaw,
  text: string,
): Promise<{ messageId: string; recipientCount: number }> {
  const msgBody = { blocks: [{ type: 'text', text }] }
  const h = signedHeaders(
    'POST',
    `/api/v1/groups/${groupId}/messages`,
    sender.clawId,
    sender.keys.privateKey,
    msgBody,
  )
  const res = await request(app)
    .post(`/api/v1/groups/${groupId}/messages`)
    .set(h)
    .send(msgBody)

  if (res.status !== 201) {
    throw new Error(`Send group message failed: ${JSON.stringify(res.body)}`)
  }

  return {
    messageId: res.body.data.message.id,
    recipientCount: res.body.data.recipientCount,
  }
}

// --- Inbox Helpers ---

export async function getInbox(
  app: Express,
  user: TestClaw,
): Promise<unknown[]> {
  const h = signedHeaders(
    'GET',
    '/api/v1/inbox',
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app).get('/api/v1/inbox').set(h)

  return res.body.data || []
}

// --- Webhook Helpers ---

export function generateWebhookSignature(
  db: Database.Database,
  secret: string,
  payload: string,
): string {
  const service = new WebhookService(db)
  return service.generateSignature(secret, payload)
}

// --- Direct Message Helpers ---

export async function sendDirectMessage(
  app: Express,
  sender: TestClaw,
  recipientIds: string[],
  text: string,
): Promise<{ messageId: string; recipientCount: number }> {
  const msgBody = {
    blocks: [{ type: 'text', text }],
    visibility: 'direct',
    toClawIds: recipientIds,
  }
  const h = signedHeaders(
    'POST',
    '/api/v1/messages',
    sender.clawId,
    sender.keys.privateKey,
    msgBody,
  )
  const res = await request(app)
    .post('/api/v1/messages')
    .set(h)
    .send(msgBody)

  if (res.status !== 201) {
    throw new Error(`Send DM failed: ${JSON.stringify(res.body)}`)
  }

  return {
    messageId: res.body.data.messageId,
    recipientCount: res.body.data.recipientCount,
  }
}
