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
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// --- Types ---

export interface TestClaw {
  clawId: string
  displayName: string
  keys: ReturnType<typeof generateKeyPair>
  x25519Private: string
  x25519Public: string
}

export type RepositoryType = 'sqlite' | 'supabase'

export interface TestContext {
  db?: Database.Database
  app: Express
  ctx: ReturnType<typeof createApp>['ctx']
  repositoryType: RepositoryType
}

export interface TestContextOptions {
  repositoryType?: RepositoryType
}

// --- Context Setup ---

/**
 * Create test context with specified repository type
 * Defaults to SQLite. Supabase requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) env vars.
 */
export function createTestContext(options?: TestContextOptions): TestContext {
  const repositoryType = options?.repositoryType ?? 'sqlite'

  if (repositoryType === 'sqlite') {
    const db = createTestDatabase()
    const { app, ctx } = createApp(db)
    return { db, app, ctx, repositoryType }
  } else {
    // Supabase implementation
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SECRET_KEY ||
                        process.env.SUPABASE_SERVICE_ROLE_KEY ||
                        process.env.SUPABASE_PUBLISHABLE_KEY ||
                        process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY')
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Create app with Supabase repositories
    const { app, ctx } = createApp({
      repositoryOptions: {
        databaseType: 'supabase',
        supabaseClient: supabase,
      },
    })

    // Note: Supabase tests use the live Supabase database
    // Make sure to clean up test data after tests
    return { app, ctx, repositoryType }
  }
}

export function destroyTestContext(tc: TestContext): void {
  if (tc.db) {
    tc.db.close()
  }
  // Supabase cleanup would go here
}

/**
 * Get available repository types for testing
 * Returns ['sqlite'] or ['sqlite', 'supabase'] depending on configuration
 *
 * Note: Supabase updated their API key format:
 * - New format (recommended): SUPABASE_PUBLISHABLE_KEY (sb_publishable_*)
 * - Old format (still supported): SUPABASE_ANON_KEY (JWT token)
 */
export function getAvailableRepositoryTypes(): RepositoryType[] {
  const types: RepositoryType[] = ['sqlite']

  // Check if Supabase is configured (support service role key and public key formats)
  const supabaseKey = process.env.SUPABASE_SECRET_KEY ||
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_PUBLISHABLE_KEY ||
                      process.env.SUPABASE_ANON_KEY
  if (process.env.SUPABASE_URL && supabaseKey) {
    types.push('supabase')
  }

  return types
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
  secret: string,
  payload: string,
): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

// --- Direct Message Helpers ---

export async function sendDirectMessage(
  app: Express,
  sender: TestClaw,
  recipient: TestClaw,
  text: string,
): Promise<string> {
  const msgBody = {
    blocks: [{ type: 'text', text }],
    visibility: 'direct',
    toClawIds: [recipient.clawId],
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

  return res.body.data.messageId
}

// --- Enhanced Friendship Helpers ---

export async function sendFriendRequest(
  app: Express,
  requester: TestClaw,
  accepter: TestClaw,
): Promise<string> {
  const body = { clawId: accepter.clawId }
  const h = signedHeaders(
    'POST',
    '/api/v1/friends/request',
    requester.clawId,
    requester.keys.privateKey,
    body,
  )
  const res = await request(app)
    .post('/api/v1/friends/request')
    .set(h)
    .send(body)

  if (res.status !== 201) {
    throw new Error(`Send friend request failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data.id
}

export async function getPendingRequests(
  app: Express,
  user: TestClaw,
): Promise<unknown[]> {
  const h = signedHeaders(
    'GET',
    '/api/v1/friends/requests',
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app).get('/api/v1/friends/requests').set(h)

  if (res.status !== 200) {
    throw new Error(`Get pending requests failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data || []
}

export async function acceptFriendRequest(
  app: Express,
  accepter: TestClaw,
  friendshipId: string,
): Promise<void> {
  const body = { friendshipId }
  const h = signedHeaders(
    'POST',
    '/api/v1/friends/accept',
    accepter.clawId,
    accepter.keys.privateKey,
    body,
  )
  const res = await request(app)
    .post('/api/v1/friends/accept')
    .set(h)
    .send(body)

  if (res.status !== 200) {
    throw new Error(`Accept friend request failed: ${JSON.stringify(res.body)}`)
  }
}

export async function listFriends(
  app: Express,
  user: TestClaw,
): Promise<unknown[]> {
  const h = signedHeaders(
    'GET',
    '/api/v1/friends',
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app).get('/api/v1/friends').set(h)

  if (res.status !== 200) {
    throw new Error(`List friends failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data || []
}

export async function removeFriend(
  app: Express,
  user: TestClaw,
  friendClawId: string,
): Promise<void> {
  const h = signedHeaders(
    'DELETE',
    `/api/v1/friends/${friendClawId}`,
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app)
    .delete(`/api/v1/friends/${friendClawId}`)
    .set(h)

  if (res.status !== 200) {
    throw new Error(`Remove friend failed: ${JSON.stringify(res.body)}`)
  }
}

// --- Message Interaction Helpers ---

export async function addReaction(
  app: Express,
  user: TestClaw,
  messageId: string,
  emoji: string,
): Promise<void> {
  const body = { emoji }
  const h = signedHeaders(
    'POST',
    `/api/v1/messages/${messageId}/reactions`,
    user.clawId,
    user.keys.privateKey,
    body,
  )
  const res = await request(app)
    .post(`/api/v1/messages/${messageId}/reactions`)
    .set(h)
    .send(body)

  if (res.status !== 201) {
    throw new Error(`Add reaction failed: ${JSON.stringify(res.body)}`)
  }
}

export async function getReactions(
  app: Express,
  user: TestClaw,
  messageId: string,
): Promise<unknown[]> {
  const h = signedHeaders(
    'GET',
    `/api/v1/messages/${messageId}/reactions`,
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app)
    .get(`/api/v1/messages/${messageId}/reactions`)
    .set(h)

  if (res.status !== 200) {
    throw new Error(`Get reactions failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data || []
}

export async function getMessage(
  app: Express,
  user: TestClaw,
  messageId: string,
): Promise<unknown> {
  const h = signedHeaders(
    'GET',
    `/api/v1/messages/${messageId}`,
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app).get(`/api/v1/messages/${messageId}`).set(h)

  if (res.status !== 200) {
    throw new Error(`Get message failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data
}

// --- Circle Helpers ---

export async function createCircle(
  app: Express,
  owner: TestClaw,
  options: {
    name: string
    description?: string
  },
): Promise<string> {
  const body = {
    name: options.name,
    description: options.description,
  }
  const h = signedHeaders(
    'POST',
    '/api/v1/circles',
    owner.clawId,
    owner.keys.privateKey,
    body,
  )
  const res = await request(app).post('/api/v1/circles').set(h).send(body)

  if (res.status !== 201) {
    throw new Error(`Create circle failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data.id
}

export async function addFriendToCircle(
  app: Express,
  owner: TestClaw,
  circleId: string,
  friendClawId: string,
): Promise<void> {
  const body = { clawId: friendClawId }
  const h = signedHeaders(
    'POST',
    `/api/v1/circles/${circleId}/friends`,
    owner.clawId,
    owner.keys.privateKey,
    body,
  )
  const res = await request(app)
    .post(`/api/v1/circles/${circleId}/friends`)
    .set(h)
    .send(body)

  if (res.status !== 201) {
    throw new Error(`Add friend to circle failed: ${JSON.stringify(res.body)}`)
  }
}

export async function sendCircleMessage(
  app: Express,
  sender: TestClaw,
  circleNames: string[],
  text: string,
): Promise<string> {
  const msgBody = {
    blocks: [{ type: 'text', text }],
    visibility: 'circles',
    circleNames,
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
    throw new Error(`Send circle message failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data.messageId
}

// --- Upload Helpers ---

export async function uploadFile(
  app: Express,
  owner: TestClaw,
  options: {
    filename: string
    mimeType: string
    size?: number
  },
): Promise<string> {
  // Note: Real file upload requires multipart/form-data with actual file
  // For E2E testing, we create a minimal Buffer to simulate file content
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { writeFileSync, unlinkSync, mkdtempSync, rmSync } = await import('node:fs')

  const tempDir = mkdtempSync(join(tmpdir(), 'clawbuds-test-upload-'))
  const filePath = join(tempDir, options.filename)

  // Create a fake file with requested size
  const fileSize = options.size || 1024
  const buffer = Buffer.alloc(fileSize, 'x')
  writeFileSync(filePath, buffer)

  try {
    const h = signedHeaders('POST', '/api/v1/uploads', owner.clawId, owner.keys.privateKey)
    const res = await request(app)
      .post('/api/v1/uploads')
      .set(h)
      .attach('file', filePath)

    if (res.status !== 201) {
      throw new Error(`Upload file failed: ${JSON.stringify(res.body)}`)
    }

    return res.body.data.id
  } finally {
    // Cleanup
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function getUpload(
  app: Express,
  user: TestClaw,
  uploadId: string,
): Promise<{ status: number; contentType?: string; size?: number }> {
  const h = signedHeaders(
    'GET',
    `/api/v1/uploads/${uploadId}`,
    user.clawId,
    user.keys.privateKey,
  )
  const res = await request(app).get(`/api/v1/uploads/${uploadId}`).set(h)

  // GET /uploads/:id returns file content, not JSON
  return {
    status: res.status,
    contentType: res.headers['content-type'],
    size: res.body?.length || res.text?.length || 0,
  }
}

export async function sendMessageWithUpload(
  app: Express,
  sender: TestClaw,
  recipient: TestClaw,
  text: string,
  uploadId: string,
  baseUrl: string = 'http://localhost:3000',
): Promise<string> {
  // Construct image URL from uploadId
  const imageUrl = `${baseUrl}/api/v1/uploads/${uploadId}`

  const msgBody = {
    blocks: [
      { type: 'text', text },
      { type: 'image', url: imageUrl },
    ],
    visibility: 'direct',
    toClawIds: [recipient.clawId],
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
    throw new Error(`Send message with upload failed: ${JSON.stringify(res.body)}`)
  }

  return res.body.data.messageId
}
