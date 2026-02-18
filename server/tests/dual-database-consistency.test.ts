/**
 * Dual Database Consistency Tests
 *
 * 验证SQLite和Supabase实现的一致性
 *
 * 测试内容：
 * 1. ID格式一致性 - 同一publicKey生成相同的clawId
 * 2. 数据格式一致性 - 返回数据结构相同
 * 3. 行为一致性 - 相同操作产生相同结果
 * 4. 类型转换正确性 - Repository层正确处理类型差异
 *
 * 注意：这些测试只在两个数据库都配置时才运行
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, generateClawId } from '@clawbuds/shared'
import request from 'supertest'
import type { TestContext } from './e2e/helpers.js'
import { createTestContext, destroyTestContext, getAvailableRepositoryTypes } from './e2e/helpers.js'

// 只在两个数据库都可用时运行这些测试
const hasMultipleDatabases = getAvailableRepositoryTypes().length > 1
const skipMessage = 'Skipped: Requires both SQLite and Supabase configured'

describe('Dual Database Consistency', () => {
  describe('ID Format Consistency', () => {
    test.skipIf(!hasMultipleDatabases)(
      'should generate same clawId for same publicKey in both databases',
      async () => {
        // 生成密钥对
        const keyPair = generateKeyPair()
        const expectedClawId = generateClawId(keyPair.publicKey)

        // 在SQLite注册
        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Test User SQLite',
          })

        // 在Supabase注册（使用不同的用户名以避免冲突）
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })
        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Test User Supabase',
          })

        // 验证两者生成相同的clawId
        expect(resSqlite.status).toBe(201)
        expect(resSupabase.status).toBe(201)

        const sqliteClawId = resSqlite.body.data.clawId
        const supabaseClawId = resSupabase.body.data.clawId

        expect(sqliteClawId).toBe(expectedClawId)
        expect(supabaseClawId).toBe(expectedClawId)
        expect(sqliteClawId).toBe(supabaseClawId)

        // 清理
        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )

    test.skipIf(!hasMultipleDatabases)(
      'should use claw_xxx format (not UUID) in both databases',
      async () => {
        const keyPair = generateKeyPair()

        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Format Test SQLite',
          })

        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Format Test Supabase',
          })

        const sqliteClawId = resSqlite.body.data.clawId
        const supabaseClawId = resSupabase.body.data.clawId

        // 验证格式：claw_ + 16位hex
        const clawIdPattern = /^claw_[0-9a-f]{16}$/

        expect(sqliteClawId).toMatch(clawIdPattern)
        expect(supabaseClawId).toMatch(clawIdPattern)

        // 验证不是UUID格式
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        expect(sqliteClawId).not.toMatch(uuidPattern)
        expect(supabaseClawId).not.toMatch(uuidPattern)

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )
  })

  describe('Data Format Consistency', () => {
    test.skipIf(!hasMultipleDatabases)(
      'should return same data structure from both databases',
      async () => {
        const keyPair = generateKeyPair()

        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Structure Test',
            bio: 'Test bio',
            tags: ['test', 'user'],
            discoverable: true,
          })

        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Structure Test',
            bio: 'Test bio',
            tags: ['test', 'user'],
            discoverable: true,
          })

        const sqliteData = resSqlite.body.data
        const supabaseData = resSupabase.body.data

        // 验证字段存在性
        const expectedFields = [
          'clawId',
          'publicKey',
          'displayName',
          'bio',
          'status',
          'createdAt',
          'lastSeenAt',
          'clawType',
          'discoverable',
          'tags',
          'capabilities',
          'autonomyLevel',
          'autonomyConfig',
          'brainProvider',
          'notificationPrefs',
        ]

        for (const field of expectedFields) {
          expect(sqliteData).toHaveProperty(field)
          expect(supabaseData).toHaveProperty(field)
        }

        // 验证字段类型一致
        expect(typeof sqliteData.clawId).toBe(typeof supabaseData.clawId)
        expect(typeof sqliteData.publicKey).toBe(typeof supabaseData.publicKey)
        expect(typeof sqliteData.createdAt).toBe(typeof supabaseData.createdAt)
        expect(Array.isArray(sqliteData.tags)).toBe(Array.isArray(supabaseData.tags))
        expect(typeof sqliteData.discoverable).toBe(typeof supabaseData.discoverable)

        // 验证值相等（除了时间戳可能有微小差异）
        expect(sqliteData.clawId).toBe(supabaseData.clawId)
        expect(sqliteData.publicKey).toBe(supabaseData.publicKey)
        expect(sqliteData.displayName).toBe(supabaseData.displayName)
        expect(sqliteData.bio).toBe(supabaseData.bio)
        expect(sqliteData.status).toBe(supabaseData.status)
        expect(sqliteData.discoverable).toBe(supabaseData.discoverable)
        expect(sqliteData.tags).toEqual(supabaseData.tags)

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )

    test.skipIf(!hasMultipleDatabases)(
      'should handle timestamp fields consistently',
      async () => {
        const keyPair = generateKeyPair()

        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Timestamp Test',
          })

        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Timestamp Test',
          })

        const sqliteData = resSqlite.body.data
        const supabaseData = resSupabase.body.data

        // 验证时间戳是字符串（ISO8601格式）
        expect(typeof sqliteData.createdAt).toBe('string')
        expect(typeof supabaseData.createdAt).toBe('string')
        expect(typeof sqliteData.lastSeenAt).toBe('string')
        expect(typeof supabaseData.lastSeenAt).toBe('string')

        // 验证可以解析为Date
        expect(new Date(sqliteData.createdAt).getTime()).toBeGreaterThan(0)
        expect(new Date(supabaseData.createdAt).getTime()).toBeGreaterThan(0)

        // 验证格式一致（ISO8601）
        // SQLite: 2026-02-17T03:44:52.563Z
        // Supabase: 2026-02-17T03:44:52.563357+00:00
        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
        expect(sqliteData.createdAt).toMatch(isoPattern)
        expect(supabaseData.createdAt).toMatch(isoPattern)

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )

    test.skipIf(!hasMultipleDatabases)(
      'should handle JSON fields consistently',
      async () => {
        const keyPair = generateKeyPair()

        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        const testTags = ['developer', 'tester', 'user']
        const testCapabilities = ['read', 'write']

        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'JSON Test',
            tags: testTags,
          })

        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'JSON Test',
            tags: testTags,
          })

        const sqliteData = resSqlite.body.data
        const supabaseData = resSupabase.body.data

        // 验证JSON字段是数组（不是字符串）
        expect(Array.isArray(sqliteData.tags)).toBe(true)
        expect(Array.isArray(supabaseData.tags)).toBe(true)
        expect(Array.isArray(sqliteData.capabilities)).toBe(true)
        expect(Array.isArray(supabaseData.capabilities)).toBe(true)

        // 验证内容相等
        expect(sqliteData.tags).toEqual(supabaseData.tags)
        expect(sqliteData.tags).toEqual(testTags)

        // 验证对象类型的JSON字段
        expect(typeof sqliteData.autonomyConfig).toBe('object')
        expect(typeof supabaseData.autonomyConfig).toBe('object')
        expect(typeof sqliteData.notificationPrefs).toBe('object')
        expect(typeof supabaseData.notificationPrefs).toBe('object')

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )
  })

  describe('Behavior Consistency', () => {
    test.skipIf(!hasMultipleDatabases)(
      'should reject duplicate publicKey in both databases',
      async () => {
        const keyPair = generateKeyPair()

        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        // 第一次注册（成功）
        await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'First User',
          })

        await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'First User',
          })

        // 第二次注册（应该失败）
        const resSqlite2 = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Second User',
          })

        const resSupabase2 = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: keyPair.publicKey,
            displayName: 'Second User',
          })

        // 验证两者都返回409冲突错误
        expect(resSqlite2.status).toBe(409)
        expect(resSupabase2.status).toBe(409)
        expect(resSqlite2.body.error).toBeDefined()
        expect(resSupabase2.body.error).toBeDefined()

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )

    test.skipIf(!hasMultipleDatabases)(
      'should handle validation errors consistently',
      async () => {
        const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
        const tcSupabase = createTestContext({ repositoryType: 'supabase' })

        // 缺少必需字段
        const resSqlite = await request(tcSqlite.app)
          .post('/api/v1/register')
          .send({
            publicKey: 'invalid-key',
            displayName: '',
          })

        const resSupabase = await request(tcSupabase.app)
          .post('/api/v1/register')
          .send({
            publicKey: 'invalid-key',
            displayName: '',
          })

        // 验证两者都返回400错误
        expect(resSqlite.status).toBe(400)
        expect(resSupabase.status).toBe(400)

        destroyTestContext(tcSqlite)
        destroyTestContext(tcSupabase)
      },
    )
  })

  describe('Performance Characteristics', () => {
    test.skipIf(!hasMultipleDatabases)(
      'should have comparable registration performance',
      async () => {
        const iterations = 5
        const sqliteTimes: number[] = []
        const supabaseTimes: number[] = []

        for (let i = 0; i < iterations; i++) {
          const keyPair = generateKeyPair()

          // SQLite
          const tcSqlite = createTestContext({ repositoryType: 'sqlite' })
          const startSqlite = Date.now()
          await request(tcSqlite.app)
            .post('/api/v1/register')
            .send({
              publicKey: keyPair.publicKey,
              displayName: `SQLite User ${i}`,
            })
          const endSqlite = Date.now()
          sqliteTimes.push(endSqlite - startSqlite)
          destroyTestContext(tcSqlite)

          // Supabase
          const tcSupabase = createTestContext({ repositoryType: 'supabase' })
          const startSupabase = Date.now()
          await request(tcSupabase.app)
            .post('/api/v1/register')
            .send({
              publicKey: keyPair.publicKey,
              displayName: `Supabase User ${i}`,
            })
          const endSupabase = Date.now()
          supabaseTimes.push(endSupabase - startSupabase)
          destroyTestContext(tcSupabase)
        }

        const sqliteAvg = sqliteTimes.reduce((a, b) => a + b, 0) / iterations
        const supabaseAvg = supabaseTimes.reduce((a, b) => a + b, 0) / iterations

        // 输出性能信息（不做断言，只记录）
        console.log(`\nPerformance Comparison (${iterations} iterations):`)
        console.log(`  SQLite avg:   ${sqliteAvg.toFixed(2)}ms`)
        console.log(`  Supabase avg: ${supabaseAvg.toFixed(2)}ms`)
        console.log(`  Ratio:        ${(supabaseAvg / sqliteAvg).toFixed(2)}x`)

        // 两者都应该在合理时间内完成（<5秒）
        expect(sqliteAvg).toBeLessThan(5000)
        expect(supabaseAvg).toBeLessThan(5000)
      },
    )
  })
})

// 如果没有配置多个数据库，输出提示
if (!hasMultipleDatabases) {
  console.warn(
    '\n⚠️  Dual database consistency tests skipped\n' +
      '   Configure Supabase to run these tests:\n' +
      '   - Set SUPABASE_URL\n' +
      '   - Set SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY\n',
  )
}
