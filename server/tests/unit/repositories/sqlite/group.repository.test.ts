/**
 * SQLite Group Repository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteGroupRepository } from '../../../../src/db/repositories/sqlite/group.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import type { CreateGroupDTO, UpdateGroupDTO } from '../../../../src/db/repositories/interfaces/group.repository.interface.js'

describe('SQLiteGroupRepository', () => {
  let db: Database.Database
  let groupRepo: SQLiteGroupRepository
  let clawRepo: SQLiteClawRepository
  let ownerId: string
  let member1Id: string
  let member2Id: string

  beforeEach(async () => {
    db = createTestDatabase()
    groupRepo = new SQLiteGroupRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    // Create test users
    const owner = await clawRepo.register({
      publicKey: 'owner-key',
      displayName: 'Owner',
    })
    const member1 = await clawRepo.register({
      publicKey: 'member1-key',
      displayName: 'Member 1',
    })
    const member2 = await clawRepo.register({
      publicKey: 'member2-key',
      displayName: 'Member 2',
    })

    ownerId = owner.clawId
    member1Id = member1.clawId
    member2Id = member2.clawId
  })

  afterEach(() => {
    db.close()
  })

  describe('create', () => {
    it('should create a new group', async () => {
      const groupData: CreateGroupDTO = {
        name: 'Test Group',
        description: 'A test group',
        createdBy: ownerId,
        isPublic: false,
      }

      const group = await groupRepo.create(groupData)

      expect(group.id).toBeDefined()
      expect(group.name).toBe('Test Group')
      expect(group.description).toBe('A test group')
      expect(group.createdBy).toBe(ownerId)
      expect(group.isPublic).toBe(false)
      expect(group.memberCount).toBe(1)
    })

    it('should create with minimal data', async () => {
      const groupData: CreateGroupDTO = {
        name: 'Minimal Group',
        createdBy: ownerId,
      }

      const group = await groupRepo.create(groupData)

      expect(group.name).toBe('Minimal Group')
      expect(group.description).toBe('')
      expect(group.isPublic).toBe(false)
    })

    it('should add creator as owner member', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const isMember = await groupRepo.isMember(group.id, ownerId)
      const permission = await groupRepo.getMemberPermission(group.id, ownerId)

      expect(isMember).toBe(true)
      expect(permission).toBe('owner')
    })

    it('should create public group', async () => {
      const group = await groupRepo.create({
        name: 'Public Group',
        createdBy: ownerId,
        isPublic: true,
      })

      expect(group.isPublic).toBe(true)
    })
  })

  describe('findById', () => {
    it('should find group by ID', async () => {
      const created = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const found = await groupRepo.findById(created.id)

      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.name).toBe('Test Group')
    })

    it('should return null for non-existent group', async () => {
      const found = await groupRepo.findById('non-existent')
      expect(found).toBeNull()
    })
  })

  describe('findByMember', () => {
    it('should find groups by member', async () => {
      const group1 = await groupRepo.create({
        name: 'Group 1',
        createdBy: ownerId,
      })
      const group2 = await groupRepo.create({
        name: 'Group 2',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group1.id, member1Id)
      await groupRepo.addMember(group2.id, member1Id)

      const groups = await groupRepo.findByMember(member1Id)

      expect(groups).toHaveLength(2)
      expect(groups.map((g) => g.id)).toContain(group1.id)
      expect(groups.map((g) => g.id)).toContain(group2.id)
    })

    it('should return empty array for non-member', async () => {
      const groups = await groupRepo.findByMember(member1Id)
      expect(groups).toEqual([])
    })

    it('should include groups created by user', async () => {
      await groupRepo.create({
        name: 'My Group',
        createdBy: ownerId,
      })

      const groups = await groupRepo.findByMember(ownerId)
      expect(groups).toHaveLength(1)
    })
  })

  describe('findPublicGroups', () => {
    it('should find public groups', async () => {
      await groupRepo.create({
        name: 'Public 1',
        createdBy: ownerId,
        isPublic: true,
      })
      await groupRepo.create({
        name: 'Private 1',
        createdBy: ownerId,
        isPublic: false,
      })
      await groupRepo.create({
        name: 'Public 2',
        createdBy: ownerId,
        isPublic: true,
      })

      const groups = await groupRepo.findPublicGroups()

      expect(groups).toHaveLength(2)
      expect(groups.every((g) => g.isPublic)).toBe(true)
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await groupRepo.create({
          name: `Public ${i}`,
          createdBy: ownerId,
          isPublic: true,
        })
      }

      const page1 = await groupRepo.findPublicGroups({ limit: 2, offset: 0 })
      const page2 = await groupRepo.findPublicGroups({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('should return empty array for no public groups', async () => {
      const groups = await groupRepo.findPublicGroups()
      expect(groups).toEqual([])
    })
  })

  describe('getMembers', () => {
    it('should get all group members', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)
      await groupRepo.addMember(group.id, member2Id)

      const members = await groupRepo.getMembers(group.id)

      expect(members).toHaveLength(3) // owner + 2 members
      expect(members.map((m) => m.clawId)).toContain(ownerId)
      expect(members.map((m) => m.clawId)).toContain(member1Id)
      expect(members.map((m) => m.clawId)).toContain(member2Id)
    })

    it('should include member information', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)

      const members = await groupRepo.getMembers(group.id)
      const member = members.find((m) => m.clawId === member1Id)

      expect(member).toBeDefined()
      expect(member?.displayName).toBe('Member 1')
      expect(member?.permission).toBe('member')
      expect(member?.joinedAt).toBeDefined()
    })
  })

  describe('getMemberPermission', () => {
    it('should get member permission', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id, 'moderator')

      const permission = await groupRepo.getMemberPermission(group.id, member1Id)
      expect(permission).toBe('moderator')
    })

    it('should return null for non-member', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const permission = await groupRepo.getMemberPermission(group.id, member1Id)
      expect(permission).toBeNull()
    })

    it('should return owner for group creator', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const permission = await groupRepo.getMemberPermission(group.id, ownerId)
      expect(permission).toBe('owner')
    })
  })

  describe('update', () => {
    it('should update group name', async () => {
      const group = await groupRepo.create({
        name: 'Original Name',
        createdBy: ownerId,
      })

      const updates: UpdateGroupDTO = {
        name: 'Updated Name',
      }
      const updated = await groupRepo.update(group.id, updates)

      expect(updated?.name).toBe('Updated Name')
    })

    it('should update group description', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const updated = await groupRepo.update(group.id, {
        description: 'New description',
      })

      expect(updated?.description).toBe('New description')
    })

    it('should update group visibility', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
        isPublic: false,
      })

      const updated = await groupRepo.update(group.id, {
        isPublic: true,
      })

      expect(updated?.isPublic).toBe(true)
    })

    it('should return null for non-existent group', async () => {
      const updated = await groupRepo.update('non-existent', {
        name: 'Test',
      })
      expect(updated).toBeNull()
    })

    it('should return unchanged group for empty updates', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const updated = await groupRepo.update(group.id, {})
      expect(updated?.name).toBe('Test Group')
    })
  })

  describe('addMember', () => {
    it('should add member to group', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.addMember(group.id, member1Id)
      const isMember = await groupRepo.isMember(group.id, member1Id)

      expect(isMember).toBe(true)
    })

    it('should add member with default permission', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.addMember(group.id, member1Id)
      const permission = await groupRepo.getMemberPermission(group.id, member1Id)

      expect(permission).toBe('member')
    })

    it('should add member with specific permission', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.addMember(group.id, member1Id, 'moderator')
      const permission = await groupRepo.getMemberPermission(group.id, member1Id)

      expect(permission).toBe('moderator')
    })

    it('should increase member count', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.addMember(group.id, member1Id)
      const updated = await groupRepo.findById(group.id)

      expect(updated?.memberCount).toBe(2)
    })
  })

  describe('removeMember', () => {
    it('should remove member from group', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)

      await groupRepo.removeMember(group.id, member1Id)
      const isMember = await groupRepo.isMember(group.id, member1Id)

      expect(isMember).toBe(false)
    })

    it('should decrease member count', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)

      await groupRepo.removeMember(group.id, member1Id)
      const updated = await groupRepo.findById(group.id)

      expect(updated?.memberCount).toBe(1)
    })
  })

  describe('updateMemberPermission', () => {
    it('should update member permission', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id, 'member')

      await groupRepo.updateMemberPermission(group.id, member1Id, 'moderator')
      const permission = await groupRepo.getMemberPermission(group.id, member1Id)

      expect(permission).toBe('moderator')
    })

    it('should downgrade permission', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id, 'moderator')

      await groupRepo.updateMemberPermission(group.id, member1Id, 'member')
      const permission = await groupRepo.getMemberPermission(group.id, member1Id)

      expect(permission).toBe('member')
    })
  })

  describe('delete', () => {
    it('should delete group', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.delete(group.id)
      const found = await groupRepo.findById(group.id)

      expect(found).toBeNull()
    })

    it('should verify group no longer exists', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      await groupRepo.delete(group.id)
      const exists = await groupRepo.exists(group.id)

      expect(exists).toBe(false)
    })
  })

  describe('isMember', () => {
    it('should return true for member', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)

      const isMember = await groupRepo.isMember(group.id, member1Id)
      expect(isMember).toBe(true)
    })

    it('should return false for non-member', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const isMember = await groupRepo.isMember(group.id, member1Id)
      expect(isMember).toBe(false)
    })

    it('should return true for group owner', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const isMember = await groupRepo.isMember(group.id, ownerId)
      expect(isMember).toBe(true)
    })
  })

  describe('countMembers', () => {
    it('should count group members', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })
      await groupRepo.addMember(group.id, member1Id)
      await groupRepo.addMember(group.id, member2Id)

      const count = await groupRepo.countMembers(group.id)
      expect(count).toBe(3)
    })

    it('should return 1 for new group (only owner)', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const count = await groupRepo.countMembers(group.id)
      expect(count).toBe(1)
    })

    it('should return 0 for non-existent group', async () => {
      const count = await groupRepo.countMembers('non-existent')
      expect(count).toBe(0)
    })
  })

  describe('exists', () => {
    it('should return true for existing group', async () => {
      const group = await groupRepo.create({
        name: 'Test Group',
        createdBy: ownerId,
      })

      const exists = await groupRepo.exists(group.id)
      expect(exists).toBe(true)
    })

    it('should return false for non-existent group', async () => {
      const exists = await groupRepo.exists('non-existent')
      expect(exists).toBe(false)
    })
  })
})
