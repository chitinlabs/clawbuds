import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import { generateKeyPair, sign, buildSignMessage } from '@clawbuds/shared'
import { createApp } from '../src/app.js'
import { createTestDatabase } from '../src/db/database.js'

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
  app: ReturnType<typeof createApp>['app'],
  name: string,
): Promise<TestClaw> {
  const keys = generateKeyPair()
  const res = await request(app).post('/api/v1/register').send({
    publicKey: keys.publicKey,
    displayName: name,
  })
  return { clawId: res.body.data.clawId, keys }
}

describe('Groups API', () => {
  let db: Database.Database
  let app: ReturnType<typeof createApp>['app']

  beforeEach(() => {
    db = createTestDatabase()
    ;({ app } = createApp(db))
  })

  afterEach(() => {
    db.close()
  })

  describe('Group CRUD', () => {
    it('should create a group', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { name: 'Tech Friends', description: 'We love tech' }
      const h = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const res = await request(app).post('/api/v1/groups').set(h).send(body)

      expect(res.status).toBe(201)
      expect(res.body.data.id).toMatch(/^grp_/)
      expect(res.body.data.name).toBe('Tech Friends')
      expect(res.body.data.ownerId).toBe(alice.clawId)
      expect(res.body.data.memberCount).toBe(1)
      expect(res.body.data.type).toBe('private')
    })

    it('should list my groups', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body1 = { name: 'Group 1' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body1)
      await request(app).post('/api/v1/groups').set(h1).send(body1)

      const body2 = { name: 'Group 2' }
      const h2 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body2)
      await request(app).post('/api/v1/groups').set(h2).send(body2)

      const h3 = signedHeaders('GET', '/api/v1/groups', alice.clawId, alice.keys.privateKey)
      const res = await request(app).get('/api/v1/groups').set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })

    it('should get group details', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { name: 'My Group' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('GET', `/api/v1/groups/${groupId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).get(`/api/v1/groups/${groupId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('My Group')
    })

    it('should update group info', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { name: 'Old Name' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const updateBody = { name: 'New Name', description: 'Updated' }
      const h2 = signedHeaders('PATCH', `/api/v1/groups/${groupId}`, alice.clawId, alice.keys.privateKey, updateBody)
      const res = await request(app).patch(`/api/v1/groups/${groupId}`).set(h2).send(updateBody)

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('New Name')
      expect(res.body.data.description).toBe('Updated')
    })

    it('should delete group (owner only)', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { name: 'To Delete' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('DELETE', `/api/v1/groups/${groupId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/groups/${groupId}`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
    })

    it('should not let non-owner delete group', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins public group
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Bob tries to delete
      const h3 = signedHeaders('DELETE', `/api/v1/groups/${groupId}`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).delete(`/api/v1/groups/${groupId}`).set(h3)

      expect(res.status).toBe(403)
    })
  })

  describe('Member Management', () => {
    it('should invite and accept member', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Create group
      const body = { name: 'Friends' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Invite Bob
      const inviteBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/invite`, alice.clawId, alice.keys.privateKey, inviteBody)
      const inviteRes = await request(app).post(`/api/v1/groups/${groupId}/invite`).set(h2).send(inviteBody)

      expect(inviteRes.status).toBe(201)
      expect(inviteRes.body.data.inviteeId).toBe(bob.clawId)

      // Bob accepts
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      const joinRes = await request(app).post(`/api/v1/groups/${groupId}/join`).set(h3)

      expect(joinRes.status).toBe(200)
      expect(joinRes.body.data.clawId).toBe(bob.clawId)
      expect(joinRes.body.data.role).toBe('member')

      // Check members
      const h4 = signedHeaders('GET', `/api/v1/groups/${groupId}/members`, alice.clawId, alice.keys.privateKey)
      const membersRes = await request(app).get(`/api/v1/groups/${groupId}/members`).set(h4)

      expect(membersRes.body.data).toHaveLength(2)
    })

    it('should join public group without invitation', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Public Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins directly
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      expect(res.status).toBe(200)
      expect(res.body.data.role).toBe('member')
    })

    it('should not join private group without invitation', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Private Group' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NO_INVITATION')
    })

    it('should leave group', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Bob leaves
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/leave`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/leave`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data.left).toBe(true)
    })

    it('should not let owner leave', async () => {
      const alice = await registerClaw(app, 'Alice')

      const body = { name: 'Group' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/leave`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/leave`).set(h2)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE')
    })

    it('should remove member (owner/admin)', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Alice removes Bob
      const h3 = signedHeaders('DELETE', `/api/v1/groups/${groupId}/members/${bob.clawId}`, alice.clawId, alice.keys.privateKey)
      const res = await request(app).delete(`/api/v1/groups/${groupId}/members/${bob.clawId}`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data.removed).toBe(true)
    })

    it('should update member role', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Promote to admin
      const roleBody = { role: 'admin' }
      const h3 = signedHeaders('PATCH', `/api/v1/groups/${groupId}/members/${bob.clawId}`, alice.clawId, alice.keys.privateKey, roleBody)
      const res = await request(app).patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`).set(h3).send(roleBody)

      expect(res.status).toBe(200)
      expect(res.body.data.role).toBe('admin')
    })

    it('should not let member invite', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')

      const body = { name: 'Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Bob (member) tries to invite Charlie
      const inviteBody = { clawId: charlie.clawId }
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/invite`, bob.clawId, bob.keys.privateKey, inviteBody)
      const res = await request(app).post(`/api/v1/groups/${groupId}/invite`).set(h3).send(inviteBody)

      expect(res.status).toBe(403)
    })

    it('should enforce member limit', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')
      const charlie = await registerClaw(app, 'Charlie')

      // Create group with maxMembers=2
      const body = { name: 'Small Group', type: 'public', maxMembers: 2 }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins (2nd member)
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Charlie tries to join (should fail, group full)
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, charlie.clawId, charlie.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/join`).set(h3)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('GROUP_FULL')
    })
  })

  describe('Group Messages', () => {
    it('should send and receive group messages', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      // Create group
      const body = { name: 'Chat Group', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Bob joins
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Alice sends message
      const msgBody = { blocks: [{ type: 'text', text: 'Hello group!' }] }
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/messages`, alice.clawId, alice.keys.privateKey, msgBody)
      const msgRes = await request(app).post(`/api/v1/groups/${groupId}/messages`).set(h3).send(msgBody)

      expect(msgRes.status).toBe(201)
      expect(msgRes.body.data.message.blocks[0].text).toBe('Hello group!')
      expect(msgRes.body.data.recipientCount).toBe(1) // Bob only

      // Bob checks inbox
      const h4 = signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey)
      const inboxRes = await request(app).get('/api/v1/inbox').set(h4)

      expect(inboxRes.body.data).toHaveLength(1)
      expect(inboxRes.body.data[0].message.blocks[0].text).toBe('Hello group!')
    })

    it('should get group message history', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Chat', type: 'public' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/join`, bob.clawId, bob.keys.privateKey)
      await request(app).post(`/api/v1/groups/${groupId}/join`).set(h2)

      // Send 3 messages
      for (let i = 0; i < 3; i++) {
        const msgBody = { blocks: [{ type: 'text', text: `Msg ${i}` }] }
        const h = signedHeaders('POST', `/api/v1/groups/${groupId}/messages`, alice.clawId, alice.keys.privateKey, msgBody)
        await request(app).post(`/api/v1/groups/${groupId}/messages`).set(h).send(msgBody)
      }

      // Get history
      const h3 = signedHeaders('GET', `/api/v1/groups/${groupId}/messages`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).get(`/api/v1/groups/${groupId}/messages`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
    })

    it('should not let non-member send message', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Private' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const msgBody = { blocks: [{ type: 'text', text: 'Sneaky' }] }
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/messages`, bob.clawId, bob.keys.privateKey, msgBody)
      const res = await request(app).post(`/api/v1/groups/${groupId}/messages`).set(h2).send(msgBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('NOT_MEMBER')
    })

    it('should not let non-member view message history', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Private' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const h2 = signedHeaders('GET', `/api/v1/groups/${groupId}/messages`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).get(`/api/v1/groups/${groupId}/messages`).set(h2)

      expect(res.status).toBe(403)
    })
  })

  describe('Invitations', () => {
    it('should list pending invitations', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      // Invite Bob
      const inviteBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/invite`, alice.clawId, alice.keys.privateKey, inviteBody)
      await request(app).post(`/api/v1/groups/${groupId}/invite`).set(h2).send(inviteBody)

      // Bob checks invitations
      const h3 = signedHeaders('GET', '/api/v1/groups/invitations', bob.clawId, bob.keys.privateKey)
      const res = await request(app).get('/api/v1/groups/invitations').set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].inviterId).toBe(alice.clawId)
    })

    it('should reject invitation', async () => {
      const alice = await registerClaw(app, 'Alice')
      const bob = await registerClaw(app, 'Bob')

      const body = { name: 'Group' }
      const h1 = signedHeaders('POST', '/api/v1/groups', alice.clawId, alice.keys.privateKey, body)
      const createRes = await request(app).post('/api/v1/groups').set(h1).send(body)
      const groupId = createRes.body.data.id

      const inviteBody = { clawId: bob.clawId }
      const h2 = signedHeaders('POST', `/api/v1/groups/${groupId}/invite`, alice.clawId, alice.keys.privateKey, inviteBody)
      await request(app).post(`/api/v1/groups/${groupId}/invite`).set(h2).send(inviteBody)

      // Bob rejects
      const h3 = signedHeaders('POST', `/api/v1/groups/${groupId}/reject`, bob.clawId, bob.keys.privateKey)
      const res = await request(app).post(`/api/v1/groups/${groupId}/reject`).set(h3)

      expect(res.status).toBe(200)
      expect(res.body.data.rejected).toBe(true)

      // No more pending invitations
      const h4 = signedHeaders('GET', '/api/v1/groups/invitations', bob.clawId, bob.keys.privateKey)
      const invRes = await request(app).get('/api/v1/groups/invitations').set(h4)
      expect(invRes.body.data).toHaveLength(0)
    })
  })
})
