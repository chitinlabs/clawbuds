/**
 * SQLite Message Repository Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase } from '../../../../src/db/database.js'
import { SQLiteMessageRepository } from '../../../../src/db/repositories/sqlite/message.repository.js'
import { SQLiteClawRepository } from '../../../../src/db/repositories/sqlite/claw.repository.js'
import type { SendMessageDTO } from '../../../../src/db/repositories/interfaces/message.repository.interface.js'

describe('SQLiteMessageRepository', () => {
  let db: Database.Database
  let messageRepo: SQLiteMessageRepository
  let clawRepo: SQLiteClawRepository
  let testClawId: string

  beforeEach(async () => {
    db = createTestDatabase()
    messageRepo = new SQLiteMessageRepository(db)
    clawRepo = new SQLiteClawRepository(db)

    // Create a test user
    const claw = await clawRepo.register({
      publicKey: 'test-key',
      displayName: 'Test User',
    })
    testClawId = claw.clawId
  })

  afterEach(() => {
    db.close()
  })

  describe('sendMessage', () => {
    it('should send a public message', async () => {
      const messageData: SendMessageDTO = {
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Hello world' }],
        visibility: 'public',
      }

      const result = await messageRepo.sendMessage(messageData)

      expect(result.message).toBeDefined()
      expect(result.message.id).toBeDefined()
      expect(result.message.fromClawId).toBe(testClawId)
      expect(result.message.blocks).toEqual(messageData.blocks)
      expect(result.message.visibility).toBe('public')
      expect(result.recipientCount).toBe(0)
    })

    it('should send a direct message', async () => {
      const recipient = await clawRepo.register({
        publicKey: 'recipient-key',
        displayName: 'Recipient',
      })

      const messageData: SendMessageDTO = {
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Direct message' }],
        visibility: 'direct',
        toClawIds: [recipient.clawId],
      }

      const result = await messageRepo.sendMessage(messageData)

      expect(result.message.visibility).toBe('direct')
      expect(result.recipientCount).toBe(1)
      expect(result.recipients).toContain(recipient.clawId)
    })

    it('should send message with content warning', async () => {
      const messageData: SendMessageDTO = {
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Sensitive content' }],
        visibility: 'public',
        contentWarning: 'Spoilers',
      }

      const result = await messageRepo.sendMessage(messageData)

      expect(result.message.contentWarning).toBe('Spoilers')
    })
  })

  describe('findById', () => {
    it('should find message by ID', async () => {
      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Test' }],
        visibility: 'public',
      })

      const found = await messageRepo.findById(sent.message.id)

      expect(found).toBeDefined()
      expect(found?.id).toBe(sent.message.id)
    })

    it('should return null for non-existent message', async () => {
      const found = await messageRepo.findById('non-existent')
      expect(found).toBeNull()
    })
  })

  describe('findPublicMessages', () => {
    it('should find public messages from user', async () => {
      await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Public 1' }],
        visibility: 'public',
      })
      await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Public 2' }],
        visibility: 'public',
      })

      const messages = await messageRepo.findPublicMessages(testClawId)

      expect(messages).toHaveLength(2)
      expect(messages[0].visibility).toBe('public')
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await messageRepo.sendMessage({
          fromClawId: testClawId,
          blocks: [{ type: 'text', text: `Message ${i}` }],
          visibility: 'public',
        })
      }

      const page1 = await messageRepo.findPublicMessages(testClawId, {
        limit: 2,
        offset: 0,
      })
      const page2 = await messageRepo.findPublicMessages(testClawId, {
        limit: 2,
        offset: 2,
      })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('editMessage', () => {
    it('should edit message', async () => {
      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Original' }],
        visibility: 'public',
      })

      const newBlocks = [{ type: 'text', text: 'Edited' }]
      const edited = await messageRepo.editMessage(
        sent.message.id,
        testClawId,
        newBlocks,
      )

      expect(edited).toBeDefined()
      expect(edited?.blocks).toEqual(newBlocks)
      expect(edited?.edited).toBe(true)
      expect(edited?.editedAt).toBeDefined()
    })

    it('should not edit message from different user', async () => {
      const otherUser = await clawRepo.register({
        publicKey: 'other-key',
        displayName: 'Other',
      })

      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Original' }],
        visibility: 'public',
      })

      const edited = await messageRepo.editMessage(
        sent.message.id,
        otherUser.clawId,
        [{ type: 'text', text: 'Hacked' }],
      )

      expect(edited).toBeNull()
    })
  })

  describe('deleteMessage', () => {
    it('should delete message', async () => {
      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'To be deleted' }],
        visibility: 'public',
      })

      await messageRepo.deleteMessage(sent.message.id, testClawId)
      const found = await messageRepo.findById(sent.message.id)

      expect(found).toBeNull()
    })

    it('should not delete message from different user', async () => {
      const otherUser = await clawRepo.register({
        publicKey: 'other-key',
        displayName: 'Other',
      })

      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Protected' }],
        visibility: 'public',
      })

      await messageRepo.deleteMessage(sent.message.id, otherUser.clawId)
      const found = await messageRepo.findById(sent.message.id)

      expect(found).toBeDefined()
    })
  })

  describe('count', () => {
    it('should count all messages', async () => {
      await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Message 1' }],
        visibility: 'public',
      })
      await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Message 2' }],
        visibility: 'public',
      })

      const count = await messageRepo.count()
      expect(count).toBe(2)
    })

    it('should count by user', async () => {
      const otherUser = await clawRepo.register({
        publicKey: 'other-key',
        displayName: 'Other',
      })

      await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'From test user' }],
        visibility: 'public',
      })
      await messageRepo.sendMessage({
        fromClawId: otherUser.clawId,
        blocks: [{ type: 'text', text: 'From other user' }],
        visibility: 'public',
      })

      const count = await messageRepo.count({ fromClawId: testClawId })
      expect(count).toBe(1)
    })
  })

  describe('exists', () => {
    it('should return true for existing message', async () => {
      const sent = await messageRepo.sendMessage({
        fromClawId: testClawId,
        blocks: [{ type: 'text', text: 'Test' }],
        visibility: 'public',
      })

      const exists = await messageRepo.exists(sent.message.id)
      expect(exists).toBe(true)
    })

    it('should return false for non-existent message', async () => {
      const exists = await messageRepo.exists('non-existent')
      expect(exists).toBe(false)
    })
  })
})
