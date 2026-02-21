/**
 * Repository Type Conversion Tests (Simplified)
 *
 * 验证Repository层正确处理SQLite和PostgreSQL之间的类型差异
 * 只测试基础的类型转换，不涉及复杂的业务流程
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPair } from '../src/lib/sign-protocol.js'
import request from 'supertest'
import type { TestContext } from './e2e/helpers.js'
import { createTestContext, destroyTestContext, getAvailableRepositoryTypes } from './e2e/helpers.js'

const REPOSITORY_TYPES = getAvailableRepositoryTypes()

describe.each(REPOSITORY_TYPES)(
  'Repository Type Conversions (Simple) [%s]',
  (repositoryType) => {
    let tc: TestContext

    beforeEach(() => {
      tc = createTestContext({ repositoryType })
    })

    afterEach(() => {
      destroyTestContext(tc)
    })

    describe('User Registration Type Conversions', () => {
      test('should return ISO8601 timestamp strings', async () => {
        const keyPair = generateKeyPair()
        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Timestamp Test',
          })

        expect(res.status).toBe(201)

        const { createdAt, lastSeenAt } = res.body.data

        // 应该是字符串
        expect(typeof createdAt).toBe('string')
        expect(typeof lastSeenAt).toBe('string')

        // 应该是ISO8601格式
        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        expect(createdAt).toMatch(isoPattern)
        expect(lastSeenAt).toMatch(isoPattern)

        // 应该可以解析为Date
        expect(new Date(createdAt).getTime()).toBeGreaterThan(0)
        expect(new Date(lastSeenAt).getTime()).toBeGreaterThan(0)
      })

      test('should return arrays for JSON fields (not strings)', async () => {
        const keyPair = generateKeyPair()
        const testTags = ['developer', 'tester']

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'JSON Test',
            tags: testTags,
          })

        expect(res.status).toBe(201)

        const { tags, capabilities } = res.body.data

        // 应该是数组（不是字符串）
        expect(Array.isArray(tags)).toBe(true)
        expect(Array.isArray(capabilities)).toBe(true)

        // 内容应该正确
        expect(tags).toEqual(testTags)
      })

      test('should return objects for JSON fields (not strings)', async () => {
        const keyPair = generateKeyPair()

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Config Test',
          })

        expect(res.status).toBe(201)

        const { autonomyConfig, notificationPrefs } = res.body.data

        // 应该是对象（不是字符串）
        expect(typeof autonomyConfig).toBe('object')
        expect(typeof notificationPrefs).toBe('object')
        expect(autonomyConfig).not.toBeNull()
        expect(notificationPrefs).not.toBeNull()
        expect(Array.isArray(autonomyConfig)).toBe(false)
      })

      test('should use claw_xxx format for claw_id', async () => {
        const keyPair = generateKeyPair()

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'ID Format Test',
          })

        expect(res.status).toBe(201)

        const { clawId } = res.body.data

        // 应该是claw_前缀 + 16位hex
        const clawIdPattern = /^claw_[0-9a-f]{16}$/
        expect(clawId).toMatch(clawIdPattern)

        // 不应该是UUID格式
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        expect(clawId).not.toMatch(uuidPattern)
      })

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
      })
    })

    describe('Data Type Consistency', () => {
      test('should return consistent types across multiple operations', async () => {
        // 注册多个用户
        const users = []
        for (let i = 0; i < 3; i++) {
          const keyPair = generateKeyPair()
          const res = await request(tc.app)
            .post('/api/v1/register')
            .send({
              publicKey: keyPair.publicKey,
              displayName: `User ${i}`,
            })

          expect(res.status).toBe(201)
          users.push(res.body.data)
        }

        // 验证所有用户都有一致的类型
        for (const user of users) {
          expect(typeof user.clawId).toBe('string')
          expect(typeof user.publicKey).toBe('string')
          expect(typeof user.displayName).toBe('string')
          expect(typeof user.createdAt).toBe('string')
          expect(Array.isArray(user.tags)).toBe(true)
          expect(typeof user.autonomyConfig).toBe('object')

          // 验证格式
          expect(user.clawId).toMatch(/^claw_[0-9a-f]{16}$/)
          expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        }
      })

      test('should handle special characters in JSON correctly', async () => {
        const keyPair = generateKeyPair()
        const specialTags = ['test"quote', "test'apostrophe", 'test\nnewline', 'test\\backslash']

        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Special Chars Test',
            tags: specialTags,
          })

        expect(res.status).toBe(201)

        const { tags } = res.body.data

        // JSON应该正确转义特殊字符
        expect(tags).toEqual(specialTags)
      })
    })

    describe('Error Handling Type Consistency', () => {
      test('should return consistent error format', async () => {
        // 使用无效数据注册
        const res = await request(tc.app)
          .post('/api/v1/register')
          .send({
            publicKey: 'invalid',
            displayName: '',
          })

        expect(res.status).toBe(400)

        const error = res.body.error

        // 错误格式应该一致
        expect(error).toHaveProperty('code')
        expect(error).toHaveProperty('message')
        expect(typeof error.code).toBe('string')
        expect(typeof error.message).toBe('string')
      })
    })
  },
)
