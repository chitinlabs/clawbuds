import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import type Database from 'better-sqlite3'
import { generateKeyPair, generateClawId } from '../src/lib/sign-protocol.js'
import { ed25519PrivateToX25519, x25519GetPublicKey } from '../src/crypto/x25519.js'
import { createTestDatabase } from '../../server/src/db/database.js'
import { createApp } from '../../server/src/app.js'
import { ClawBudsClient } from '../src/client.js'
import {
  addProfile,
  savePrivateKey,
  saveProfileState,
  getCurrentProfile,
  loadPrivateKey,
  getCurrentProfileName,
} from '../src/config.js'

let db: Database.Database
let server: Server
let serverUrl: string
let tmpDir: string

beforeAll(async () => {
  db = createTestDatabase()
  const { app } = createApp(db)
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const addr = server.address()
  if (typeof addr === 'object' && addr) {
    serverUrl = `http://localhost:${addr.port}`
  }
})

afterAll(() => {
  server?.close()
  db?.close()
})

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'clawbuds-integration-'))
  process.env.CLAWBUDS_CONFIG_DIR = tmpDir
})

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAWBUDS_CONFIG_DIR
})

async function registerUser(name: string): Promise<{
  client: ClawBudsClient
  clawId: string
  privateKey: string
}> {
  const keys = generateKeyPair()
  const client = new ClawBudsClient({ serverUrl })
  const profile = await client.register(keys.publicKey, name)

  const clawId = profile.clawId

  // Create authenticated client
  const authedClient = new ClawBudsClient({
    serverUrl,
    clawId,
    privateKey: keys.privateKey,
  })

  return { client: authedClient, clawId, privateKey: keys.privateKey }
}

describe('integration', () => {
  it('register + profile flow', async () => {
    const { client, clawId } = await registerUser('Alice')
    const me = await client.getMe()
    expect(me.clawId).toBe(clawId)
    expect(me.displayName).toBe('Alice')
  })

  it('friend request + accept flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Alice sends friend request to Bob
    const request = await alice.client.sendFriendRequest(bob.clawId)
    expect(request.status).toBe('pending')

    // Bob sees pending request
    const pending = await bob.client.getPendingRequests()
    expect(pending).toHaveLength(1)
    expect(pending[0].requesterId).toBe(alice.clawId)

    // Bob accepts
    await bob.client.acceptFriendRequest(pending[0].id)

    // Both see each other in friends list
    const aliceFriends = await alice.client.listFriends()
    expect(aliceFriends).toHaveLength(1)
    expect(aliceFriends[0].clawId).toBe(bob.clawId)

    const bobFriends = await bob.client.listFriends()
    expect(bobFriends).toHaveLength(1)
    expect(bobFriends[0].clawId).toBe(alice.clawId)
  })

  it('send message + inbox flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Become friends
    await alice.client.sendFriendRequest(bob.clawId)
    const pending = await bob.client.getPendingRequests()
    await bob.client.acceptFriendRequest(pending[0].id)

    // Alice sends a public message
    const result = await alice.client.sendMessage({
      blocks: [{ type: 'text', text: 'Hello Bob!' }],
      visibility: 'public',
    })
    expect(result.recipientCount).toBe(1)

    // Bob checks inbox
    const inbox = await bob.client.getInbox({ status: 'unread' })
    expect(inbox).toHaveLength(1)
    expect(inbox[0].message.fromClawId).toBe(alice.clawId)
    expect(inbox[0].message.blocks[0]).toEqual({ type: 'text', text: 'Hello Bob!' })

    // Bob acks
    const ackResult = await bob.client.ackInbox([inbox[0].id])
    expect(ackResult.acknowledged).toBe(1)

    // Unread count is now 0
    const count = await bob.client.getUnreadCount()
    expect(count.unread).toBe(0)
  })

  it('direct message flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Become friends
    await alice.client.sendFriendRequest(bob.clawId)
    const pending = await bob.client.getPendingRequests()
    await bob.client.acceptFriendRequest(pending[0].id)

    // Alice sends direct message
    const result = await alice.client.sendMessage({
      blocks: [{ type: 'text', text: 'DM to Bob' }],
      visibility: 'direct',
      toClawIds: [bob.clawId],
    })
    expect(result.recipientCount).toBe(1)

    // Bob sees it
    const inbox = await bob.client.getInbox({ status: 'unread' })
    expect(inbox).toHaveLength(1)
    expect(inbox[0].message.visibility).toBe('direct')
  })

  it('config persistence flow', async () => {
    const keys = generateKeyPair()
    const clawId = generateClawId(keys.publicKey)

    addProfile('test', {
      serverUrl,
      clawId,
      publicKey: keys.publicKey,
      displayName: 'Test',
    })
    savePrivateKey('test', keys.privateKey)
    saveProfileState('test', { lastSeq: 0 })

    // Load back and create client
    const config = getCurrentProfile()!
    const privateKey = loadPrivateKey(getCurrentProfileName()!)!
    expect(config.clawId).toBe(clawId)

    const client = new ClawBudsClient({
      serverUrl: config.serverUrl,
      clawId: config.clawId,
      privateKey,
    })

    // Register first, then verify
    await client.register(keys.publicKey, 'Test')
    const me = await client.getMe()
    expect(me.displayName).toBe('Test')
  })

  // === v1.1 Integration Tests ===

  it('group create + invite + join + message flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Alice creates a group
    const group = await alice.client.createGroup({
      name: 'Test Group',
      description: 'Integration test group',
      type: 'private',
    })
    expect(group.name).toBe('Test Group')
    expect(group.memberCount).toBe(1)

    // Alice lists her groups
    const groups = await alice.client.listGroups()
    expect(groups).toHaveLength(1)

    // Alice invites Bob
    const invitation = await alice.client.inviteToGroup(group.id, bob.clawId)
    expect(invitation.inviteeId).toBe(bob.clawId)

    // Bob sees pending invitations
    const invitations = await bob.client.getGroupInvitations()
    expect(invitations).toHaveLength(1)
    expect(invitations[0].groupName).toBe('Test Group')

    // Bob joins
    const member = await bob.client.joinGroup(group.id)
    expect(member.clawId).toBe(bob.clawId)

    // Verify members
    const members = await alice.client.getGroupMembers(group.id)
    expect(members).toHaveLength(2)

    // Alice sends a group message
    const result = await alice.client.sendGroupMessage(group.id, {
      blocks: [{ type: 'text', text: 'Hello group!' }],
    })
    expect(result.recipientCount).toBe(1) // Bob only (sender excluded)

    // Bob sees message in inbox
    const inbox = await bob.client.getInbox({ status: 'unread' })
    expect(inbox.length).toBeGreaterThanOrEqual(1)
    const groupMsg = inbox.find((e) => e.message.blocks[0]?.type === 'text' && (e.message.blocks[0] as { text: string }).text === 'Hello group!')
    expect(groupMsg).toBeDefined()

    // Alice can view group messages
    const messages = await alice.client.getGroupMessages(group.id)
    expect(messages).toHaveLength(1)
    expect(messages[0].blocks[0]).toEqual({ type: 'text', text: 'Hello group!' })

    // Bob leaves
    await bob.client.leaveGroup(group.id)
    const membersAfter = await alice.client.getGroupMembers(group.id)
    expect(membersAfter).toHaveLength(1)
  })

  it('webhook create + list + delete flow', async () => {
    const alice = await registerUser('Alice')

    // Create webhook
    const webhook = await alice.client.createWebhook({
      type: 'outgoing',
      name: 'test-hook',
      url: 'https://example.com/hook',
      events: ['message.new'],
    })
    expect(webhook.name).toBe('test-hook')
    expect(webhook.active).toBe(true)

    // List webhooks
    const webhooks = await alice.client.listWebhooks()
    expect(webhooks).toHaveLength(1)
    expect(webhooks[0].id).toBe(webhook.id)

    // Delete webhook
    const result = await alice.client.deleteWebhook(webhook.id)
    expect(result.deleted).toBe(true)

    // Verify empty
    const after = await alice.client.listWebhooks()
    expect(after).toHaveLength(0)
  })

  it('E2EE setup + status + disable flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Alice sets up E2EE
    const aliceX25519Private = ed25519PrivateToX25519(alice.privateKey)
    const aliceX25519Public = x25519GetPublicKey(aliceX25519Private)
    const key = await alice.client.registerE2eeKey(aliceX25519Public)
    expect(key.clawId).toBe(alice.clawId)
    expect(key.keyFingerprint).toHaveLength(16)

    // Bob sets up E2EE
    const bobX25519Private = ed25519PrivateToX25519(bob.privateKey)
    const bobX25519Public = x25519GetPublicKey(bobX25519Private)
    await bob.client.registerE2eeKey(bobX25519Public)

    // Alice can query Bob's key
    const bobKey = await alice.client.getE2eeKey(bob.clawId)
    expect(bobKey.x25519PublicKey).toBe(bobX25519Public)

    // Batch query
    const keys = await alice.client.batchGetE2eeKeys([alice.clawId, bob.clawId])
    expect(keys).toHaveLength(2)

    // Alice disables E2EE
    const result = await alice.client.deleteE2eeKey()
    expect(result.deleted).toBe(true)

    // Verify deleted
    await expect(alice.client.getE2eeKey(alice.clawId)).rejects.toThrow()
  })

  it('encrypted group + sender keys flow', async () => {
    const alice = await registerUser('Alice')
    const bob = await registerUser('Bob')

    // Create encrypted group
    const group = await alice.client.createGroup({
      name: 'Secret Group',
      encrypted: true,
    })
    expect(group.encrypted).toBe(true)

    // Invite and join
    await alice.client.inviteToGroup(group.id, bob.clawId)
    await bob.client.joinGroup(group.id)

    // Alice uploads sender key for Bob
    const senderKeys = await alice.client.uploadSenderKeys(group.id, [
      { recipientId: bob.clawId, encryptedKey: 'encrypted-sender-key-for-bob' },
    ])
    expect(senderKeys).toHaveLength(1)
    expect(senderKeys[0].keyGeneration).toBe(1)

    // Bob retrieves sender keys
    const bobKeys = await bob.client.getSenderKeys(group.id)
    expect(bobKeys).toHaveLength(1)
    expect(bobKeys[0].senderId).toBe(alice.clawId)
    expect(bobKeys[0].encryptedKey).toBe('encrypted-sender-key-for-bob')
  })
})
