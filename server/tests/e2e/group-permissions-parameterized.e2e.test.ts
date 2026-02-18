/**
 * E2E Test: Group Permission Management (Parameterized)
 *
 * Tests the role-based access control for groups across BOTH SQLite and Supabase:
 * - owner: full control (CRUD, invite, remove, promote)
 * - admin: can invite and remove members
 * - member: can send messages only
 *
 * Also covers: owner transfer restrictions, public vs private groups,
 * member limit enforcement, invitation workflow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { TestContext, TestClaw, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
  signedHeaders,
  createGroup,
  inviteToGroup,
  joinGroup,
  sendGroupMessage,
} from './helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)(
  'E2E: Group Permission Management [%s]',
  (repositoryType: RepositoryType) => {
    let tc: TestContext
    let alice: TestClaw // owner
    let bob: TestClaw // will be admin
    let charlie: TestClaw // will be member
    let dave: TestClaw // outsider

    beforeEach(async () => {
      tc = createTestContext({ repositoryType })
      alice = await registerClaw(tc.app, 'Alice')
      bob = await registerClaw(tc.app, 'Bob')
      charlie = await registerClaw(tc.app, 'Charlie')
      dave = await registerClaw(tc.app, 'Dave')
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    describe('Role-Based Access Control', () => {
      it('should enforce owner/admin/member permission hierarchy', { timeout: 60000 }, async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'RBAC Group',
        })

        await inviteToGroup(tc.app, groupId, alice, bob)
        await joinGroup(tc.app, groupId, bob)
        await inviteToGroup(tc.app, groupId, alice, charlie)
        await joinGroup(tc.app, groupId, charlie)

        // Promote Bob to admin
        const promoteBody = { role: 'admin' }
        const promoteH = signedHeaders(
          'PATCH',
          `/api/v1/groups/${groupId}/members/${bob.clawId}`,
          alice.clawId,
          alice.keys.privateKey,
          promoteBody,
        )
        const promoteRes = await request(tc.app)
          .patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
          .set(promoteH)
          .send(promoteBody)

        expect(promoteRes.status).toBe(200)
        expect(promoteRes.body.data.role).toBe('admin')

        // Admin (Bob) can invite Dave
        await inviteToGroup(tc.app, groupId, bob, dave)
        await joinGroup(tc.app, groupId, dave)

        // Member (Charlie) CANNOT invite
        const newUser = await registerClaw(tc.app, 'Eve')
        const inviteBody = { clawId: newUser.clawId }
        const inviteH = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/invite`,
          charlie.clawId,
          charlie.keys.privateKey,
          inviteBody,
        )
        const inviteRes = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/invite`)
          .set(inviteH)
          .send(inviteBody)

        expect(inviteRes.status).toBe(403)
        expect(inviteRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS')

        // All members CAN send messages
        await sendGroupMessage(tc.app, groupId, alice, 'Owner message')
        await sendGroupMessage(tc.app, groupId, bob, 'Admin message')
        await sendGroupMessage(tc.app, groupId, charlie, 'Member message')
        await sendGroupMessage(tc.app, groupId, dave, 'New member message')

        const histH = signedHeaders(
          'GET',
          `/api/v1/groups/${groupId}/messages`,
          alice.clawId,
          alice.keys.privateKey,
        )
        const histRes = await request(tc.app)
          .get(`/api/v1/groups/${groupId}/messages`)
          .set(histH)

        expect(histRes.body.data).toHaveLength(4)
      })

      it('should prevent changing owner role', async () => {
        const groupId = await createGroup(tc.app, alice, { name: 'Owner Role Test' })

        const body = { role: 'member' }
        const h = signedHeaders(
          'PATCH',
          `/api/v1/groups/${groupId}/members/${alice.clawId}`,
          alice.clawId,
          alice.keys.privateKey,
          body,
        )
        const res = await request(tc.app)
          .patch(`/api/v1/groups/${groupId}/members/${alice.clawId}`)
          .set(h)
          .send(body)

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('CANNOT_CHANGE_OWNER')
      })
    })

    describe('Group Deletion', () => {
      it('should only allow owner to delete group', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Delete Test',
          type: 'public',
        })

        await joinGroup(tc.app, groupId, bob)

        // Bob (member) cannot delete
        const bobDelH = signedHeaders(
          'DELETE',
          `/api/v1/groups/${groupId}`,
          bob.clawId,
          bob.keys.privateKey,
        )
        const bobDelRes = await request(tc.app)
          .delete(`/api/v1/groups/${groupId}`)
          .set(bobDelH)

        expect(bobDelRes.status).toBe(403)

        // Alice (owner) can delete
        const aliceDelH = signedHeaders(
          'DELETE',
          `/api/v1/groups/${groupId}`,
          alice.clawId,
          alice.keys.privateKey,
        )
        const aliceDelRes = await request(tc.app)
          .delete(`/api/v1/groups/${groupId}`)
          .set(aliceDelH)

        expect(aliceDelRes.status).toBe(200)
        expect(aliceDelRes.body.data.deleted).toBe(true)

        // Verify group is gone
        const getH = signedHeaders(
          'GET',
          `/api/v1/groups/${groupId}`,
          alice.clawId,
          alice.keys.privateKey,
        )
        const getRes = await request(tc.app)
          .get(`/api/v1/groups/${groupId}`)
          .set(getH)

        expect(getRes.status).toBe(404)
      })
    })

    describe('Public vs Private Groups', () => {
      it('should allow joining public group without invitation', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Public Room',
          type: 'public',
        })

        const joinH = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/join`,
          bob.clawId,
          bob.keys.privateKey,
        )
        const joinRes = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/join`)
          .set(joinH)

        expect(joinRes.status).toBe(200)
        expect(joinRes.body.data.role).toBe('member')
      })

      it('should require invitation for private group', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Private Room',
          type: 'private',
        })

        const joinH = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/join`,
          bob.clawId,
          bob.keys.privateKey,
        )
        const joinRes = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/join`)
          .set(joinH)

        expect(joinRes.status).toBe(404)
        expect(joinRes.body.error.code).toBe('NO_INVITATION')
      })
    })

    describe('Member Limit Enforcement', () => {
      it('should enforce max member limit', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Small Group',
          type: 'public',
          maxMembers: 3,
        })

        await joinGroup(tc.app, groupId, bob)
        await joinGroup(tc.app, groupId, charlie)

        // Dave tries to join (4/3 -- should fail)
        const joinH = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/join`,
          dave.clawId,
          dave.keys.privateKey,
        )
        const joinRes = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/join`)
          .set(joinH)

        expect(joinRes.status).toBe(409)
        expect(joinRes.body.error.code).toBe('GROUP_FULL')
      })
    })

    describe('Invitation Workflow', () => {
      it('should support full invitation lifecycle: invite -> view -> accept', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Invitation Group',
        })

        await inviteToGroup(tc.app, groupId, alice, bob)

        const invH = signedHeaders(
          'GET',
          '/api/v1/groups/invitations',
          bob.clawId,
          bob.keys.privateKey,
        )
        const invRes = await request(tc.app)
          .get('/api/v1/groups/invitations')
          .set(invH)

        expect(invRes.status).toBe(200)
        expect(invRes.body.data).toHaveLength(1)
        expect(invRes.body.data[0].groupId).toBe(groupId)
        expect(invRes.body.data[0].groupName).toBe('Invitation Group')
        expect(invRes.body.data[0].inviterName).toBe('Alice')

        await joinGroup(tc.app, groupId, bob)

        const invH2 = signedHeaders(
          'GET',
          '/api/v1/groups/invitations',
          bob.clawId,
          bob.keys.privateKey,
        )
        const invRes2 = await request(tc.app)
          .get('/api/v1/groups/invitations')
          .set(invH2)

        expect(invRes2.body.data).toHaveLength(0)
      })

      it('should support invitation rejection', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Rejection Test',
        })

        await inviteToGroup(tc.app, groupId, alice, bob)

        const rejectH = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/reject`,
          bob.clawId,
          bob.keys.privateKey,
        )
        const rejectRes = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/reject`)
          .set(rejectH)

        expect(rejectRes.status).toBe(200)
        expect(rejectRes.body.data.rejected).toBe(true)

        const membersH = signedHeaders(
          'GET',
          `/api/v1/groups/${groupId}/members`,
          alice.clawId,
          alice.keys.privateKey,
        )
        const membersRes = await request(tc.app)
          .get(`/api/v1/groups/${groupId}/members`)
          .set(membersH)

        expect(membersRes.body.data).toHaveLength(1) // Only Alice
      })

      it('should prevent duplicate invitations', async () => {
        const groupId = await createGroup(tc.app, alice, {
          name: 'Dup Invite Test',
        })

        await inviteToGroup(tc.app, groupId, alice, bob)

        const inviteBody = { clawId: bob.clawId }
        const h = signedHeaders(
          'POST',
          `/api/v1/groups/${groupId}/invite`,
          alice.clawId,
          alice.keys.privateKey,
          inviteBody,
        )
        const res = await request(tc.app)
          .post(`/api/v1/groups/${groupId}/invite`)
          .set(h)
          .send(inviteBody)

        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ALREADY_INVITED')
      })
    })

    describe('Repository Type Verification', () => {
      it(`should be using ${repositoryType} repository`, () => {
        expect(tc.repositoryType).toBe(repositoryType)
      })
    })
  },
)
