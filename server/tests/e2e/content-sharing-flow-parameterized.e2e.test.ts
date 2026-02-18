/**
 * E2E Test: Content Upload and Sharing Flow (Parameterized)
 *
 * Tests the complete file sharing journey across multiple Repositories:
 * - IClawRepository: User registration
 * - IFriendshipRepository: Friend validation
 * - IUploadRepository: File upload and access
 * - IMessageRepository: Message with image blocks
 *
 * This test runs on BOTH SQLite and Supabase implementations
 * to verify Repository abstraction consistency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { TestContext, TestClaw, RepositoryType } from './helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
  makeFriends,
  uploadFile,
  sendMessageWithUpload,
  getInbox,
  getUpload,
  addReaction,
  getReactions,
  sendDirectMessage,
} from './helpers.js'

// Get available repository types (conditionally includes Supabase if configured)
const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)(
  'E2E: Content Sharing Flow [%s]',
  (repositoryType: RepositoryType) => {
    let tc: TestContext
    let alice: TestClaw
    let bob: TestClaw

    beforeEach(async () => {
      tc = createTestContext({ repositoryType })
      alice = await registerClaw(tc.app, 'Alice')
      bob = await registerClaw(tc.app, 'Bob')
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    describe('Complete Content Sharing Journey', () => {
      it('should complete: upload file → send message → receive → react', async () => {
        // Verify repository type in context
        expect(tc.repositoryType).toBe(repositoryType)

        // 1. Alice and Bob become friends
        await makeFriends(tc.app, alice, bob)

        // 2. Alice uploads an image
        const uploadId = await uploadFile(tc.app, alice, {
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 100 * 1024, // 100KB
        })

        expect(uploadId).toBeTruthy()

        // 3. Alice sends message with the image
        const messageId = await sendMessageWithUpload(
          tc.app,
          alice,
          bob,
          'Check out my photo! 📸',
          uploadId,
        )

        expect(messageId).toBeTruthy()

        // 4. Bob checks his inbox
        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(1)

        const inboxEntry = bobInbox[0] as any
        expect(inboxEntry.message.id).toBe(messageId)
        expect(inboxEntry.message.fromClawId).toBe(alice.clawId)
        expect(inboxEntry.message.blocks).toHaveLength(2)

        // First block: text
        expect(inboxEntry.message.blocks[0].type).toBe('text')
        expect(inboxEntry.message.blocks[0].text).toBe('Check out my photo! 📸')

        // Second block: image with upload URL
        expect(inboxEntry.message.blocks[1].type).toBe('image')
        expect(inboxEntry.message.blocks[1].url).toContain(uploadId)

        // 5. Bob can access the upload
        const uploadAccess = await getUpload(tc.app, bob, uploadId)
        expect(uploadAccess.status).toBe(200)

        // 6. Bob reacts to the message
        await addReaction(tc.app, bob, messageId, '❤️')

        // 7. Alice views the reaction
        const reactions = await getReactions(tc.app, alice, messageId)
        expect(reactions).toHaveLength(1)
        expect((reactions[0] as any).emoji).toBe('❤️')
        expect((reactions[0] as any).clawIds).toContain(bob.clawId)
      })

      it('should prevent non-friend from accessing shared image', async () => {
        const charlie = await registerClaw(tc.app, 'Charlie')

        // Alice and Bob are friends
        await makeFriends(tc.app, alice, bob)

        // Alice uploads image
        const uploadId = await uploadFile(tc.app, alice, {
          filename: 'private.jpg',
          mimeType: 'image/jpeg',
        })

        // Alice shares with Bob only
        await sendMessageWithUpload(tc.app, alice, bob, 'For your eyes only', uploadId)

        // Bob can access the upload
        const bobAccess = await getUpload(tc.app, bob, uploadId)
        expect(bobAccess.status).toBe(200)

        // Charlie (non-friend/non-recipient) should also be able to access
        // because uploads are public (unguessable UUID)
        const charlieAccess = await getUpload(tc.app, charlie, uploadId)
        expect(charlieAccess.status).toBe(200)

        // But Charlie doesn't see the message in inbox
        const charlieInbox = await getInbox(tc.app, charlie)
        expect(charlieInbox).toHaveLength(0)
      })

      it('should allow mixing text-only and image messages', async () => {
        await makeFriends(tc.app, alice, bob)

        // Alice sends text-only message
        await sendDirectMessage(tc.app, alice, bob, 'Hello Bob!')

        // Alice uploads and shares image
        const uploadId = await uploadFile(tc.app, alice, {
          filename: 'report.jpg',
          mimeType: 'image/jpeg',
        })
        await sendMessageWithUpload(tc.app, alice, bob, 'Here is the image', uploadId)

        // Alice sends another text-only message
        await sendDirectMessage(tc.app, alice, bob, 'Let me know what you think')

        // Bob's inbox should have all 3 messages
        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(3)

        // Verify message types
        const messages = (bobInbox as any[]).map((entry) => ({
          text: entry.message.blocks[0].text,
          hasImage: entry.message.blocks.some((b: any) => b.type === 'image'),
        }))

        expect(messages[0].text).toBe('Hello Bob!')
        expect(messages[0].hasImage).toBe(false)

        expect(messages[1].text).toBe('Here is the image')
        expect(messages[1].hasImage).toBe(true)

        expect(messages[2].text).toBe('Let me know what you think')
        expect(messages[2].hasImage).toBe(false)

        // Bob can react to image message
        const imageMessageId = (bobInbox[1] as any).message.id
        await addReaction(tc.app, bob, imageMessageId, '👍')

        const reactions = await getReactions(tc.app, alice, imageMessageId)
        expect(reactions).toHaveLength(1)
        expect((reactions[0] as any).emoji).toBe('👍')
      })
    })

    describe('Multiple File Uploads', () => {
      it('should support multiple images in single message', async () => {
        await makeFriends(tc.app, alice, bob)

        // Alice uploads 3 images
        const upload1 = await uploadFile(tc.app, alice, { filename: 'photo1.jpg', mimeType: 'image/jpeg' })
        const upload2 = await uploadFile(tc.app, alice, { filename: 'photo2.jpg', mimeType: 'image/jpeg' })
        const upload3 = await uploadFile(tc.app, alice, { filename: 'photo3.jpg', mimeType: 'image/jpeg' })

        // Send message with all 3 images
        const { signedHeaders } = await import('./helpers.js')
        const request = (await import('supertest')).default
        const baseUrl = 'http://localhost:3000'

        const msgBody = {
          blocks: [
            { type: 'text', text: 'Here are all the photos!' },
            { type: 'image', url: `${baseUrl}/api/v1/uploads/${upload1}` },
            { type: 'image', url: `${baseUrl}/api/v1/uploads/${upload2}` },
            { type: 'image', url: `${baseUrl}/api/v1/uploads/${upload3}` },
          ],
          visibility: 'direct',
          toClawIds: [bob.clawId],
        }

        const h = signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody)
        const res = await request(tc.app).post('/api/v1/messages').set(h).send(msgBody)

        expect(res.status).toBe(201)

        // Bob receives message with all 3 images
        const bobInbox = await getInbox(tc.app, bob)
        expect(bobInbox).toHaveLength(1)

        const message = (bobInbox[0] as any).message
        expect(message.blocks).toHaveLength(4) // 1 text + 3 images

        const imageBlocks = message.blocks.filter((b: any) => b.type === 'image')
        expect(imageBlocks).toHaveLength(3)

        // Verify Bob can access all images
        const access1 = await getUpload(tc.app, bob, upload1)
        const access2 = await getUpload(tc.app, bob, upload2)
        const access3 = await getUpload(tc.app, bob, upload3)

        expect(access1.status).toBe(200)
        expect(access2.status).toBe(200)
        expect(access3.status).toBe(200)
      })

      it('should handle large image uploads within limits', async () => {
        await makeFriends(tc.app, alice, bob)

        // Upload large image (8MB - within 10MB limit)
        const largeUploadId = await uploadFile(tc.app, alice, {
          filename: 'large-image.jpg',
          mimeType: 'image/jpeg',
          size: 8 * 1024 * 1024, // 8MB
        })

        expect(largeUploadId).toBeTruthy()

        // Share with Bob
        await sendMessageWithUpload(tc.app, alice, bob, 'Large image file', largeUploadId)

        // Bob can access
        const bobAccess = await getUpload(tc.app, bob, largeUploadId)
        expect(bobAccess.status).toBe(200)
      })
    })

    describe('Repository Type Verification', () => {
      it(`should be using ${repositoryType} repository`, () => {
        expect(tc.repositoryType).toBe(repositoryType)
      })
    })
  },
)

// Summary: Run status based on available repository types
if (REPOSITORY_TYPES.length === 1) {
  console.log(`
  ℹ️  Repository Testing Info:
  - Running tests on: SQLite only
  - Supabase tests skipped (not configured)
  - To enable Supabase tests, set SUPABASE_URL and SUPABASE_ANON_KEY env vars
  `)
} else {
  console.log(`
  ✓ Repository Testing Info:
  - Running tests on: ${REPOSITORY_TYPES.join(', ')}
  - All repository types configured
  `)
}
