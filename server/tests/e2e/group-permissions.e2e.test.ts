/**
 * E2E Test: Group Permission Management
 *
 * IMPORTANT PRIORITY
 *
 * Tests the role-based access control for groups:
 * - owner: full control (CRUD, invite, remove, promote)
 * - admin: can invite and remove members
 * - member: can send messages only
 *
 * Also covers: owner transfer restrictions, public vs private groups,
 * member limit enforcement, invitation workflow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'

import {
  type TestContext,
  type TestClaw,
  createTestContext,
  destroyTestContext,
  registerClaw,
  signedHeaders,
  createGroup,
  inviteToGroup,
  joinGroup,
  sendGroupMessage,
} from './helpers.js'

describe('E2E: Group Permission Management', () => {
  let tc: TestContext
  let alice: TestClaw // owner
  let bob: TestClaw // will be admin
  let charlie: TestClaw // will be member
  let dave: TestClaw // outsider

  beforeEach(async () => {
    tc = createTestContext()
    alice = await registerClaw(tc.app, 'Alice')
    bob = await registerClaw(tc.app, 'Bob')
    charlie = await registerClaw(tc.app, 'Charlie')
    dave = await registerClaw(tc.app, 'Dave')
  })

  afterEach(() => {
    destroyTestContext(tc)
  })

  describe('Role-Based Access Control', () => {
    it('should enforce owner/admin/member permission hierarchy', async () => {
      // Step 1: Alice creates group (becomes owner)
      const groupId = await createGroup(tc.app, alice, {
        name: 'RBAC Group',
      })

      // Step 2: Invite and add Bob and Charlie
      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)
      await inviteToGroup(tc.app, groupId, alice, charlie)
      await joinGroup(tc.app, groupId, charlie)

      // Step 3: Promote Bob to admin
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

      // Step 4: Admin (Bob) can invite Dave
      await inviteToGroup(tc.app, groupId, bob, dave)
      await joinGroup(tc.app, groupId, dave)

      // Step 5: Member (Charlie) CANNOT invite
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

      // Step 6: All members CAN send messages
      await sendGroupMessage(tc.app, groupId, alice, 'Owner message')
      await sendGroupMessage(tc.app, groupId, bob, 'Admin message')
      await sendGroupMessage(tc.app, groupId, charlie, 'Member message')
      await sendGroupMessage(tc.app, groupId, dave, 'New member message')

      // Verify all 4 messages exist in history
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

    it('should allow admin to remove member but not other admins', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Admin Test',
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
      await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
        .set(promoteH)
        .send(promoteBody)

      // Also promote Charlie to admin
      const promoteH2 = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}/members/${charlie.clawId}`,
        alice.clawId,
        alice.keys.privateKey,
        promoteBody,
      )
      await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${charlie.clawId}`)
        .set(promoteH2)
        .send(promoteBody)

      // Add Dave as regular member
      await inviteToGroup(tc.app, groupId, alice, dave)
      await joinGroup(tc.app, groupId, dave)

      // Bob (admin) can remove Dave (member)
      const removeDaveH = signedHeaders(
        'DELETE',
        `/api/v1/groups/${groupId}/members/${dave.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const removeDaveRes = await request(tc.app)
        .delete(`/api/v1/groups/${groupId}/members/${dave.clawId}`)
        .set(removeDaveH)

      expect(removeDaveRes.status).toBe(200)

      // Bob (admin) CANNOT remove Charlie (another admin)
      const removeCharlieH = signedHeaders(
        'DELETE',
        `/api/v1/groups/${groupId}/members/${charlie.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const removeCharlieRes = await request(tc.app)
        .delete(`/api/v1/groups/${groupId}/members/${charlie.clawId}`)
        .set(removeCharlieH)

      expect(removeCharlieRes.status).toBe(403)
      expect(removeCharlieRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS')

      // Bob (admin) CANNOT remove Alice (owner)
      const removeAliceH = signedHeaders(
        'DELETE',
        `/api/v1/groups/${groupId}/members/${alice.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
      )
      const removeAliceRes = await request(tc.app)
        .delete(`/api/v1/groups/${groupId}/members/${alice.clawId}`)
        .set(removeAliceH)

      expect(removeAliceRes.status).toBe(403)
    })

    it('should only allow owner to promote/demote members', async () => {
      const groupId = await createGroup(tc.app, alice, { name: 'Promotion Test' })

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
      await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
        .set(promoteH)
        .send(promoteBody)

      // Bob (admin) tries to promote Charlie -- should fail (only owner can)
      const promoteCH = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}/members/${charlie.clawId}`,
        bob.clawId,
        bob.keys.privateKey,
        promoteBody,
      )
      const promoteCRes = await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${charlie.clawId}`)
        .set(promoteCH)
        .send(promoteBody)

      expect(promoteCRes.status).toBe(403)

      // Alice (owner) can demote Bob back to member
      const demoteBody = { role: 'member' }
      const demoteH = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}/members/${bob.clawId}`,
        alice.clawId,
        alice.keys.privateKey,
        demoteBody,
      )
      const demoteRes = await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
        .set(demoteH)
        .send(demoteBody)

      expect(demoteRes.status).toBe(200)
      expect(demoteRes.body.data.role).toBe('member')
    })

    it('should prevent changing owner role', async () => {
      const groupId = await createGroup(tc.app, alice, { name: 'Owner Role Test' })

      // Cannot change owner to member
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

  describe('Owner Leave Restriction', () => {
    it('should prevent owner from leaving the group', async () => {
      const groupId = await createGroup(tc.app, alice, { name: 'Owner Leave' })

      const leaveH = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/leave`,
        alice.clawId,
        alice.keys.privateKey,
      )
      const res = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/leave`)
        .set(leaveH)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE')
    })
  })

  describe('Public vs Private Groups', () => {
    it('should allow joining public group without invitation', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Public Room',
        type: 'public',
      })

      // Bob joins directly (no invitation needed)
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

      // Bob tries to join without invitation
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

      // Bob joins (2/3)
      await joinGroup(tc.app, groupId, bob)

      // Charlie joins (3/3)
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

    it('should allow joining after member leaves', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Revolving Group',
        type: 'public',
        maxMembers: 2,
      })

      // Bob joins (2/2)
      await joinGroup(tc.app, groupId, bob)

      // Charlie cannot join (full)
      const joinH1 = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/join`,
        charlie.clawId,
        charlie.keys.privateKey,
      )
      const joinRes1 = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/join`)
        .set(joinH1)

      expect(joinRes1.status).toBe(409)

      // Bob leaves
      const leaveH = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/leave`,
        bob.clawId,
        bob.keys.privateKey,
      )
      await request(tc.app)
        .post(`/api/v1/groups/${groupId}/leave`)
        .set(leaveH)

      // Charlie can now join
      const joinH2 = signedHeaders(
        'POST',
        `/api/v1/groups/${groupId}/join`,
        charlie.clawId,
        charlie.keys.privateKey,
      )
      const joinRes2 = await request(tc.app)
        .post(`/api/v1/groups/${groupId}/join`)
        .set(joinH2)

      expect(joinRes2.status).toBe(200)
    })
  })

  describe('Invitation Workflow', () => {
    it('should support full invitation lifecycle: invite -> view -> accept', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Invitation Group',
      })

      // Alice invites Bob
      await inviteToGroup(tc.app, groupId, alice, bob)

      // Bob sees the invitation
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

      // Bob accepts
      await joinGroup(tc.app, groupId, bob)

      // No more pending invitations
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

      // Bob rejects
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

      // Bob is not a member
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

      // First invitation
      await inviteToGroup(tc.app, groupId, alice, bob)

      // Second invitation should fail
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

    it('should prevent inviting existing members', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Already Member Test',
      })

      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)

      // Try to invite Bob again (already a member)
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
      expect(res.body.error.code).toBe('ALREADY_MEMBER')
    })
  })

  describe('Group Update Permissions', () => {
    it('should allow owner and admin to update group info', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Update Test',
      })

      await inviteToGroup(tc.app, groupId, alice, bob)
      await joinGroup(tc.app, groupId, bob)

      // Promote Bob to admin
      const promoteBody = { role: 'admin' }
      const promoteH = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}/members/${bob.clawId}`,
        alice.clawId,
        alice.keys.privateKey,
        promoteBody,
      )
      await request(tc.app)
        .patch(`/api/v1/groups/${groupId}/members/${bob.clawId}`)
        .set(promoteH)
        .send(promoteBody)

      // Admin (Bob) can update
      const updateBody = { description: 'Updated by admin' }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}`,
        bob.clawId,
        bob.keys.privateKey,
        updateBody,
      )
      const updateRes = await request(tc.app)
        .patch(`/api/v1/groups/${groupId}`)
        .set(updateH)
        .send(updateBody)

      expect(updateRes.status).toBe(200)
      expect(updateRes.body.data.description).toBe('Updated by admin')
    })

    it('should prevent member from updating group info', async () => {
      const groupId = await createGroup(tc.app, alice, {
        name: 'Member Update Test',
        type: 'public',
      })

      await joinGroup(tc.app, groupId, bob)

      // Member (Bob) cannot update
      const updateBody = { name: 'Hacked Name' }
      const updateH = signedHeaders(
        'PATCH',
        `/api/v1/groups/${groupId}`,
        bob.clawId,
        bob.keys.privateKey,
        updateBody,
      )
      const updateRes = await request(tc.app)
        .patch(`/api/v1/groups/${groupId}`)
        .set(updateH)
        .send(updateBody)

      expect(updateRes.status).toBe(403)
    })
  })
})
