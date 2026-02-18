/**
 * Supabase Storage Service Integration Tests
 * 需要可用的 Supabase 实例和 Storage bucket
 *
 * 环境变量:
 *   SUPABASE_URL - Supabase 项目 URL
 *   SUPABASE_SECRET_KEY 或 SUPABASE_SERVICE_ROLE_KEY - Service Role Key
 *
 * 运行: npx vitest run tests/unit/integration/supabase-storage-integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SupabaseStorageService } from '../../../src/storage/supabase/supabase-storage.service.js'
import { StorageFactory } from '../../../src/storage/factory.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_TEST_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
const TEST_BUCKET = 'uploads'
const TEST_PREFIX = `test-${Date.now()}`

describe('SupabaseStorageService Integration', () => {
  let supabase: SupabaseClient
  let storage: SupabaseStorageService
  let isAvailable = false
  const uploadedPaths: string[] = [] // Track for cleanup

  beforeAll(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SECRET_KEY not configured')
      return
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    storage = new SupabaseStorageService(supabase)

    // Verify connection by checking if bucket exists
    try {
      const { data, error } = await supabase.storage.getBucket(TEST_BUCKET)
      if (error) {
        // Try to create the bucket
        const { error: createError } = await supabase.storage.createBucket(TEST_BUCKET, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10MB
        })
        if (createError) {
          console.log(`Skipping: Cannot access or create bucket "${TEST_BUCKET}": ${createError.message}`)
          return
        }
      }
      isAvailable = true
    } catch (err: any) {
      console.log(`Skipping: Supabase connection failed: ${err.message}`)
    }
  })

  afterAll(async () => {
    if (!isAvailable) return

    // Clean up all test files
    if (uploadedPaths.length > 0) {
      try {
        await supabase.storage.from(TEST_BUCKET).remove(uploadedPaths)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  describe('Upload & Download', () => {
    it('should upload a file to Supabase Storage', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/test-upload.txt`
      const content = Buffer.from('Hello from Supabase Storage integration test!')

      const result = await storage.upload(TEST_BUCKET, testPath, content, {
        contentType: 'text/plain',
      })

      uploadedPaths.push(testPath)

      expect(result).toBeDefined()
      expect(result.path).toBe(testPath)
      expect(result.size).toBe(content.length)
      expect(result.url).toContain(SUPABASE_URL)
    })

    it('should download the uploaded file', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/test-download.txt`
      const content = Buffer.from('Download test content')

      await storage.upload(TEST_BUCKET, testPath, content, {
        contentType: 'text/plain',
      })
      uploadedPaths.push(testPath)

      const downloaded = await storage.download(TEST_BUCKET, testPath)
      expect(downloaded.toString()).toBe('Download test content')
    })

    it('should upload an image-like binary file', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/test-image.jpg`
      // Create a small fake JPEG (JFIF header)
      const fakeJpeg = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
        0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      ])

      const result = await storage.upload(TEST_BUCKET, testPath, fakeJpeg, {
        contentType: 'image/jpeg',
      })

      uploadedPaths.push(testPath)

      expect(result.size).toBe(fakeJpeg.length)
      expect(result.url).toBeTruthy()
    })
  })

  describe('URL Generation', () => {
    it('should generate a public URL', async () => {
      if (!isAvailable) return

      const url = storage.getPublicUrl(TEST_BUCKET, `${TEST_PREFIX}/some-file.txt`)

      expect(url).toContain(SUPABASE_URL)
      expect(url).toContain(TEST_BUCKET)
      expect(url).toContain(`${TEST_PREFIX}/some-file.txt`)
    })

    it('should generate a signed URL', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/signed-url-test.txt`
      await storage.upload(TEST_BUCKET, testPath, Buffer.from('signed'), {
        contentType: 'text/plain',
      })
      uploadedPaths.push(testPath)

      const signedUrl = await storage.getSignedUrl(TEST_BUCKET, testPath, 60)

      expect(signedUrl).toContain(SUPABASE_URL)
      expect(signedUrl).toContain('token=')
    })
  })

  describe('Delete', () => {
    it('should delete a file', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/test-delete.txt`
      await storage.upload(TEST_BUCKET, testPath, Buffer.from('to be deleted'), {
        contentType: 'text/plain',
      })

      // Delete should not throw
      await storage.delete(TEST_BUCKET, testPath)

      // Verify it's deleted
      const exists = await storage.exists(TEST_BUCKET, testPath)
      expect(exists).toBe(false)
    })

    it('should delete multiple files', async () => {
      if (!isAvailable) return

      const paths = [
        `${TEST_PREFIX}/batch-del-1.txt`,
        `${TEST_PREFIX}/batch-del-2.txt`,
      ]

      for (const p of paths) {
        await storage.upload(TEST_BUCKET, p, Buffer.from('batch'), {
          contentType: 'text/plain',
        })
      }

      await storage.deleteMany(TEST_BUCKET, paths)

      for (const p of paths) {
        const exists = await storage.exists(TEST_BUCKET, p)
        expect(exists).toBe(false)
      }
    })
  })

  describe('Exists & Metadata', () => {
    it('should check if file exists', async () => {
      if (!isAvailable) return

      const testPath = `${TEST_PREFIX}/exists-check.txt`
      await storage.upload(TEST_BUCKET, testPath, Buffer.from('exists'), {
        contentType: 'text/plain',
      })
      uploadedPaths.push(testPath)

      expect(await storage.exists(TEST_BUCKET, testPath)).toBe(true)
      expect(await storage.exists(TEST_BUCKET, `${TEST_PREFIX}/nonexistent.txt`)).toBe(false)
    })

    it('should list files with prefix', async () => {
      if (!isAvailable) return

      const listPath1 = `${TEST_PREFIX}/list-a.txt`
      const listPath2 = `${TEST_PREFIX}/list-b.txt`

      await storage.upload(TEST_BUCKET, listPath1, Buffer.from('a'), { contentType: 'text/plain' })
      await storage.upload(TEST_BUCKET, listPath2, Buffer.from('b'), { contentType: 'text/plain' })
      uploadedPaths.push(listPath1, listPath2)

      const files = await storage.list(TEST_BUCKET, { prefix: TEST_PREFIX })
      const fileNames = files.map(f => f.path)

      expect(fileNames.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('StorageFactory with Supabase', () => {
  it('should create SupabaseStorageService via factory', () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const storage = StorageFactory.create({
      storageType: 'supabase',
      supabaseClient: supabase,
    })

    expect(storage).toBeInstanceOf(SupabaseStorageService)
  })
})
