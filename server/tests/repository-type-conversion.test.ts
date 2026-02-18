/**
 * Repository Type Conversion Tests
 *
 * 验证Repository层正确处理SQLite和PostgreSQL之间的类型差异：
 * 1. TEXT ↔ TIMESTAMPTZ (时间戳)
 * 2. TEXT ↔ JSONB (JSON数据)
 * 3. TEXT ↔ UUID (非claw_id的ID)
 *
 * 这些测试确保Repository抽象层正确封装数据库类型差异
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPair } from '@clawbuds/shared'
import request from 'supertest'
import type { TestContext } from './e2e/helpers.js'
import {
  createTestContext,
  destroyTestContext,
  getAvailableRepositoryTypes,
  registerClaw,
  makeFriends,
  sendDirectMessage,
  signedHeaders,
} from './e2e/helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

// Message IDs: SQLite stores as 32-char hex, Supabase normalizes to dashed UUID
// Accept both formats: hex (32 chars) or UUID (8-4-4-4-12 with dashes)
const hexOrUuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
const hexOrUuidPrefixPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}/

describe.each(REPOSITORY_TYPES)(
  'Repository Type Conversions [%s]',
  (repositoryType) => {
    let tc: TestContext

    beforeEach(() => {
      tc = createTestContext({ repositoryType })
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    describe('Timestamp Conversion (TEXT ↔ TIMESTAMPTZ)', () => {
      test('should convert createdAt to ISO8601 string', async () => {
        const keyPair = generateKeyPair()
        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Timestamp Test User',
          })

        expect(res.status).toBe(201)

        const { createdAt, lastSeenAt } = res.body.data

        // 应该是字符串
        expect(typeof createdAt).toBe('string')
        expect(typeof lastSeenAt).toBe('string')

        // 应该是有效的ISO8601格式
        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        expect(createdAt).toMatch(isoPattern)
        expect(lastSeenAt).toMatch(isoPattern)

        // 应该可以解析为Date
        const createdDate = new Date(createdAt)
        const lastSeenDate = new Date(lastSeenAt)

        expect(createdDate.getTime()).toBeGreaterThan(0)
        expect(lastSeenDate.getTime()).toBeGreaterThan(0)

        // 应该是最近的时间（不超过1分钟前）
        const now = Date.now()
        expect(now - createdDate.getTime()).toBeLessThan(60000)
        expect(now - lastSeenDate.getTime()).toBeLessThan(60000)
      })

      test('should handle nullable timestamps correctly', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')

        // 发送好友请求
        const reqBody = { clawId: bob.clawId }
        const reqRes = await request(tc.app)
          .post('/api/v1/friends/request')
          .set(
            signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, reqBody),
          )
          .send(reqBody)

        expect(reqRes.status).toBe(201)

        // 此时 acceptedAt 应该是 null
        const friendship = reqRes.body.data
        expect(friendship.acceptedAt).toBeNull()

        // 接受好友请求
        const acceptBody = { friendshipId: friendship.id }
        const acceptRes = await request(tc.app)
          .post('/api/v1/friends/accept')
          .set(
            signedHeaders(
              'POST',
              '/api/v1/friends/accept',
              bob.clawId,
              bob.keys.privateKey,
              acceptBody,
            ),
          )
          .send(acceptBody)

        expect(acceptRes.status).toBe(200)

        // 现在 acceptedAt 应该有值
        const accepted = acceptRes.body.data
        expect(accepted.acceptedAt).toBeTruthy()
        expect(typeof accepted.acceptedAt).toBe('string')

        const acceptedDate = new Date(accepted.acceptedAt)
        expect(acceptedDate.getTime()).toBeGreaterThan(0)
      }, 30000)
    })

    describe('JSON Conversion (TEXT ↔ JSONB)', () => {
      test('should convert tags array to/from JSON', async () => {
        const keyPair = generateKeyPair()
        const testTags = ['developer', 'tester', 'early-adopter']

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'JSON Test User',
            tags: testTags,
          })

        expect(res.status).toBe(201)

        const { tags } = res.body.data

        // 应该是数组（不是字符串）
        expect(Array.isArray(tags)).toBe(true)

        // 应该包含所有元素
        expect(tags).toEqual(testTags)
        expect(tags).toHaveLength(3)
        expect(tags).toContain('developer')
        expect(tags).toContain('tester')
        expect(tags).toContain('early-adopter')
      })

      test('should convert autonomyConfig object to/from JSON', async () => {
        const keyPair = generateKeyPair()

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Config Test User',
          })

        expect(res.status).toBe(201)

        const { autonomyConfig, notificationPrefs } = res.body.data

        // 应该是对象（不是字符串）
        expect(typeof autonomyConfig).toBe('object')
        expect(typeof notificationPrefs).toBe('object')
        expect(autonomyConfig).not.toBeNull()
        expect(notificationPrefs).not.toBeNull()

        // 应该不是数组
        expect(Array.isArray(autonomyConfig)).toBe(false)
        expect(Array.isArray(notificationPrefs)).toBe(false)
      })

      test('should handle message blocks_json correctly', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')

        await makeFriends(tc.app, alice, bob)

        const testBlocks = [
          { type: 'text', text: 'Hello!' },
          { type: 'text', text: 'How are you?' },
          { type: 'image', url: 'https://example.com/image.jpg' },
        ]

        // 发送消息
        const msgBody = {
          blocks: testBlocks,
          visibility: 'direct',
          toClawIds: [bob.clawId],
        }

        const msgRes = await request(tc.app)
          .post('/api/v1/messages')
          .set(signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody))
          .send(msgBody)

        expect(msgRes.status).toBe(201)
        const messageId = msgRes.body.data.messageId

        // 通过 GET /api/v1/messages/:id 获取完整消息并验证 blocks
        const getRes = await request(tc.app)
          .get(`/api/v1/messages/${messageId}`)
          .set(signedHeaders('GET', `/api/v1/messages/${messageId}`, alice.clawId, alice.keys.privateKey))

        expect(getRes.status).toBe(200)
        const message = getRes.body.data

        // blocks 应该是数组
        expect(Array.isArray(message.blocks)).toBe(true)
        expect(message.blocks).toHaveLength(3)

        // 应该保持结构
        expect(message.blocks[0]).toEqual(testBlocks[0])
        expect(message.blocks[1]).toEqual(testBlocks[1])
        expect(message.blocks[2]).toEqual(testBlocks[2])
      }, 30000)

      test('should handle empty arrays correctly', async () => {
        const keyPair = generateKeyPair()

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Empty Array Test',
            tags: [],
          })

        expect(res.status).toBe(201)

        const { tags, capabilities } = res.body.data

        // 空数组应该保持为数组（不是null）
        expect(Array.isArray(tags)).toBe(true)
        expect(tags).toHaveLength(0)

        expect(Array.isArray(capabilities)).toBe(true)
        expect(capabilities).toHaveLength(0)
      })
    })

    describe('UUID Conversion (TEXT ↔ UUID)', () => {
      test('should generate valid UUID for message IDs', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')

        await makeFriends(tc.app, alice, bob)

        // 发送消息
        const msgBody = {
          blocks: [{ type: 'text', text: 'Test message' }],
          visibility: 'direct',
          toClawIds: [bob.clawId],
        }

        const msgRes = await request(tc.app)
          .post('/api/v1/messages')
          .set(signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody))
          .send(msgBody)

        expect(msgRes.status).toBe(201)

        // POST 返回 { messageId, recipientCount, recipients, createdAt }
        const { messageId } = msgRes.body.data

        // messageId 应该是字符串
        expect(typeof messageId).toBe('string')

        // 应该是有效的hex/UUID格式（SQLite: 32-char hex, Supabase: dashed UUID）
        expect(messageId).toMatch(hexOrUuidPattern)

        // 不应该是 claw_ 格式
        expect(messageId).not.toMatch(/^claw_/)
      }, 30000)

      test('should generate valid UUID for friendship IDs', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')

        const reqBody = { clawId: bob.clawId }
        const reqRes = await request(tc.app)
          .post('/api/v1/friends/request')
          .set(signedHeaders('POST', '/api/v1/friends/request', alice.clawId, alice.keys.privateKey, reqBody))
          .send(reqBody)

        expect(reqRes.status).toBe(201)

        const friendship = reqRes.body.data

        // friendship.id 应该是hex/UUID
        expect(typeof friendship.id).toBe('string')
        expect(friendship.id).toMatch(hexOrUuidPattern)
      }, 30000)

      test('should use claw_xxx format only for claw_id', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')

        await makeFriends(tc.app, alice, bob)

        // 发送消息
        const msgBody = {
          blocks: [{ type: 'text', text: 'ID format test' }],
          visibility: 'direct',
          toClawIds: [bob.clawId],
        }

        const msgRes = await request(tc.app)
          .post('/api/v1/messages')
          .set(signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msgBody))
          .send(msgBody)

        expect(msgRes.status).toBe(201)
        const { messageId } = msgRes.body.data

        // 通过 GET 获取完整消息
        const getRes = await request(tc.app)
          .get(`/api/v1/messages/${messageId}`)
          .set(signedHeaders('GET', `/api/v1/messages/${messageId}`, alice.clawId, alice.keys.privateKey))

        expect(getRes.status).toBe(200)
        const message = getRes.body.data

        // claw_id 使用 claw_ 格式
        expect(message.fromClawId).toMatch(/^claw_[0-9a-f]{16}$/)

        // message.id 使用 hex/UUID 格式
        expect(message.id).toMatch(hexOrUuidPattern)

        // thread_id, reply_to_id 也应该是 hex/UUID（如果有值）
        if (message.threadId) {
          expect(message.threadId).toMatch(hexOrUuidPattern)
        }
      }, 30000)
    })

    describe('Type Consistency Across Operations', () => {
      test('should maintain type consistency in list operations', async () => {
        const alice = await registerClaw(tc.app, 'Alice')
        const bob = await registerClaw(tc.app, 'Bob')
        const charlie = await registerClaw(tc.app, 'Charlie')

        await makeFriends(tc.app, alice, bob)
        await makeFriends(tc.app, alice, charlie)

        // 发送多条消息
        const msg1Body = {
          blocks: [{ type: 'text', text: 'Message 1' }],
          visibility: 'direct',
          toClawIds: [bob.clawId],
        }
        await request(tc.app)
          .post('/api/v1/messages')
          .set(signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msg1Body))
          .send(msg1Body)

        const msg2Body = {
          blocks: [{ type: 'text', text: 'Message 2' }],
          visibility: 'direct',
          toClawIds: [charlie.clawId],
        }
        await request(tc.app)
          .post('/api/v1/messages')
          .set(signedHeaders('POST', '/api/v1/messages', alice.clawId, alice.keys.privateKey, msg2Body))
          .send(msg2Body)

        // 获取收件箱
        const inboxRes = await request(tc.app)
          .get('/api/v1/inbox')
          .set(signedHeaders('GET', '/api/v1/inbox', bob.clawId, bob.keys.privateKey))

        expect(inboxRes.status).toBe(200)

        const entries = inboxRes.body.data

        // 所有inbox条目应该有一致的类型
        // InboxEntry: { id, seq, status, message: { id, fromClawId, ... }, createdAt }
        for (const entry of entries) {
          expect(typeof entry.id).toBe('string')
          expect(typeof entry.createdAt).toBe('string')
          expect(entry.message).toBeDefined()

          const msg = entry.message
          expect(typeof msg.id).toBe('string')
          expect(typeof msg.fromClawId).toBe('string')
          expect(typeof msg.createdAt).toBe('string')
          expect(Array.isArray(msg.blocks)).toBe(true)

          // 验证格式
          expect(msg.id).toMatch(hexOrUuidPrefixPattern)
          expect(msg.fromClawId).toMatch(/^claw_[0-9a-f]{16}$/)
          expect(msg.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        }
      }, 30000)
    })
  },
)
