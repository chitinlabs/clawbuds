/**
 * Local Storage Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { LocalStorageService } from '../../../src/storage/local/local-storage.service.js'

describe('LocalStorageService', () => {
  let storage: LocalStorageService
  let testDir: string
  const testBucket = 'test-bucket'

  beforeEach(async () => {
    // 创建临时测试目录
    testDir = await mkdtemp(join(tmpdir(), 'storage-test-'))
    storage = new LocalStorageService({
      rootDir: testDir,
      baseUrl: 'http://localhost:3000/storage',
    })
  })

  afterEach(async () => {
    // 清理临时测试目录
    await rm(testDir, { recursive: true, force: true })
  })

  describe('upload', () => {
    it('should upload a file from Buffer', async () => {
      const content = Buffer.from('Hello World')
      const path = 'test/file.txt'

      const result = await storage.upload(testBucket, path, content)

      expect(result.path).toBe(path)
      expect(result.size).toBe(content.length)
      expect(result.url).toBe('http://localhost:3000/storage/test-bucket/test/file.txt')
      expect(result.contentType).toBe('text/plain')
    })

    it('should upload a file from Stream', async () => {
      const content = 'Stream content'
      const stream = Readable.from([content])
      const path = 'test/stream.txt'

      const result = await storage.upload(testBucket, path, stream)

      expect(result.path).toBe(path)
      expect(result.size).toBe(content.length)
      expect(result.url).toContain(path)
    })

    it('should detect content type from extension', async () => {
      const content = Buffer.from('image data')

      const pngResult = await storage.upload(testBucket, 'image.png', content)
      expect(pngResult.contentType).toBe('image/png')

      const jpgResult = await storage.upload(testBucket, 'photo.jpg', content)
      expect(jpgResult.contentType).toBe('image/jpeg')

      const pdfResult = await storage.upload(testBucket, 'doc.pdf', content)
      expect(pdfResult.contentType).toBe('application/pdf')
    })

    it('should use provided content type', async () => {
      const content = Buffer.from('custom content')
      const path = 'file.bin'

      const result = await storage.upload(testBucket, path, content, {
        contentType: 'application/custom',
      })

      expect(result.contentType).toBe('application/custom')
    })

    it('should save metadata', async () => {
      const content = Buffer.from('data')
      const path = 'test/meta.txt'
      const metadata = { userId: '123', uploadedBy: 'Alice' }

      await storage.upload(testBucket, path, content, { metadata })

      const retrieved = await storage.getMetadata(testBucket, path)
      expect(retrieved.metadata).toEqual(metadata)
    })

    it('should create nested directories', async () => {
      const content = Buffer.from('nested')
      const path = 'a/b/c/d/file.txt'

      const result = await storage.upload(testBucket, path, content)

      expect(result.path).toBe(path)
      const exists = await storage.exists(testBucket, path)
      expect(exists).toBe(true)
    })
  })

  describe('uploadMany', () => {
    it('should upload multiple files', async () => {
      const files = [
        { path: 'file1.txt', file: Buffer.from('content1') },
        { path: 'file2.txt', file: Buffer.from('content2') },
        { path: 'file3.txt', file: Buffer.from('content3') },
      ]

      const results = await storage.uploadMany(testBucket, files)

      expect(results).toHaveLength(3)
      expect(results[0].path).toBe('file1.txt')
      expect(results[1].path).toBe('file2.txt')
      expect(results[2].path).toBe('file3.txt')
    })

    it('should upload files with options', async () => {
      const files = [
        {
          path: 'custom1.dat',
          file: Buffer.from('data1'),
          options: { contentType: 'application/custom' },
        },
        {
          path: 'custom2.dat',
          file: Buffer.from('data2'),
          options: { metadata: { type: 'test' } },
        },
      ]

      const results = await storage.uploadMany(testBucket, files)

      expect(results[0].contentType).toBe('application/custom')

      const meta = await storage.getMetadata(testBucket, 'custom2.dat')
      expect(meta.metadata).toEqual({ type: 'test' })
    })
  })

  describe('download', () => {
    it('should download uploaded file', async () => {
      const content = Buffer.from('Download me')
      const path = 'download-test.txt'

      await storage.upload(testBucket, path, content)
      const downloaded = await storage.download(testBucket, path)

      expect(downloaded.toString()).toBe('Download me')
    })

    it('should throw error for non-existent file', async () => {
      await expect(storage.download(testBucket, 'non-existent.txt')).rejects.toThrow()
    })
  })

  describe('getPublicUrl', () => {
    it('should generate public URL', () => {
      const url = storage.getPublicUrl(testBucket, 'test/file.txt')
      expect(url).toBe('http://localhost:3000/storage/test-bucket/test/file.txt')
    })

    it('should handle nested paths', () => {
      const url = storage.getPublicUrl(testBucket, 'a/b/c/file.png')
      expect(url).toBe('http://localhost:3000/storage/test-bucket/a/b/c/file.png')
    })
  })

  describe('getSignedUrl', () => {
    it('should generate signed URL with expiry', async () => {
      const url = await storage.getSignedUrl(testBucket, 'private.txt', 3600)

      expect(url).toContain('http://localhost:3000/storage/test-bucket/private.txt')
      expect(url).toContain('expires=')
    })

    it('should include expiry timestamp', async () => {
      const expiresIn = 3600
      const beforeTime = Date.now() + expiresIn * 1000
      const url = await storage.getSignedUrl(testBucket, 'file.txt', expiresIn)
      const afterTime = Date.now() + expiresIn * 1000

      const match = url.match(/expires=(\d+)/)
      expect(match).not.toBeNull()
      const timestamp = parseInt(match![1])

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('delete', () => {
    it('should delete uploaded file', async () => {
      const content = Buffer.from('Delete me')
      const path = 'delete-test.txt'

      await storage.upload(testBucket, path, content)
      expect(await storage.exists(testBucket, path)).toBe(true)

      await storage.delete(testBucket, path)
      expect(await storage.exists(testBucket, path)).toBe(false)
    })

    it('should delete metadata file', async () => {
      const content = Buffer.from('data')
      const path = 'with-meta.txt'
      const metadata = { key: 'value' }

      await storage.upload(testBucket, path, content, { metadata })
      await storage.delete(testBucket, path)

      await expect(storage.getMetadata(testBucket, path)).rejects.toThrow()
    })

    it('should not throw error for non-existent file', async () => {
      await expect(storage.delete(testBucket, 'non-existent.txt')).resolves.not.toThrow()
    })
  })

  describe('deleteMany', () => {
    it('should delete multiple files', async () => {
      const paths = ['file1.txt', 'file2.txt', 'file3.txt']

      for (const path of paths) {
        await storage.upload(testBucket, path, Buffer.from('content'))
      }

      await storage.deleteMany(testBucket, paths)

      for (const path of paths) {
        expect(await storage.exists(testBucket, path)).toBe(false)
      }
    })

    it('should not throw error for mixed existent/non-existent files', async () => {
      await storage.upload(testBucket, 'exists.txt', Buffer.from('data'))

      await expect(
        storage.deleteMany(testBucket, ['exists.txt', 'non-existent.txt']),
      ).resolves.not.toThrow()
    })
  })

  describe('list', () => {
    it('should list all files in bucket', async () => {
      await storage.upload(testBucket, 'file1.txt', Buffer.from('1'))
      await storage.upload(testBucket, 'file2.txt', Buffer.from('2'))
      await storage.upload(testBucket, 'dir/file3.txt', Buffer.from('3'))

      const files = await storage.list(testBucket)

      expect(files).toHaveLength(3)
      expect(files.map((f) => f.path)).toContain('file1.txt')
      expect(files.map((f) => f.path)).toContain('file2.txt')
      expect(files.map((f) => f.path)).toContain('dir/file3.txt')
    })

    it('should filter by prefix', async () => {
      await storage.upload(testBucket, 'images/photo1.jpg', Buffer.from('img1'))
      await storage.upload(testBucket, 'images/photo2.jpg', Buffer.from('img2'))
      await storage.upload(testBucket, 'docs/file.pdf', Buffer.from('doc'))

      const images = await storage.list(testBucket, { prefix: 'images' })

      expect(images).toHaveLength(2)
      expect(images.every((f) => f.path.startsWith('images'))).toBe(true)
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.upload(testBucket, `file${i}.txt`, Buffer.from(`${i}`))
      }

      const page1 = await storage.list(testBucket, { limit: 3, offset: 0 })
      const page2 = await storage.list(testBucket, { limit: 3, offset: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      expect(page1[0].path).not.toBe(page2[0].path)
    })

    it('should return empty array for non-existent bucket', async () => {
      const files = await storage.list('non-existent-bucket')
      expect(files).toEqual([])
    })

    it('should include file metadata', async () => {
      const content = Buffer.from('test content')
      await storage.upload(testBucket, 'test.txt', content)

      const files = await storage.list(testBucket)

      expect(files[0].path).toBe('test.txt')
      expect(files[0].size).toBe(content.length)
      expect(files[0].contentType).toBe('text/plain')
      expect(files[0].lastModified).toBeInstanceOf(Date)
    })
  })

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await storage.upload(testBucket, 'exists.txt', Buffer.from('data'))

      const exists = await storage.exists(testBucket, 'exists.txt')
      expect(exists).toBe(true)
    })

    it('should return false for non-existent file', async () => {
      const exists = await storage.exists(testBucket, 'not-exists.txt')
      expect(exists).toBe(false)
    })
  })

  describe('getMetadata', () => {
    it('should get file metadata', async () => {
      const content = Buffer.from('metadata test')
      const path = 'meta-test.txt'

      await storage.upload(testBucket, path, content)
      const metadata = await storage.getMetadata(testBucket, path)

      expect(metadata.path).toBe(path)
      expect(metadata.size).toBe(content.length)
      expect(metadata.contentType).toBe('text/plain')
      expect(metadata.lastModified).toBeInstanceOf(Date)
    })

    it('should include custom metadata', async () => {
      const content = Buffer.from('data')
      const path = 'with-custom-meta.txt'
      const customMeta = { author: 'Alice', version: '1.0' }

      await storage.upload(testBucket, path, content, { metadata: customMeta })
      const metadata = await storage.getMetadata(testBucket, path)

      expect(metadata.metadata).toEqual(customMeta)
    })

    it('should throw error for non-existent file', async () => {
      await expect(storage.getMetadata(testBucket, 'non-existent.txt')).rejects.toThrow()
    })
  })

  describe('copy', () => {
    it('should copy file within same bucket', async () => {
      const content = Buffer.from('Copy me')
      const sourcePath = 'source.txt'
      const destPath = 'destination.txt'

      await storage.upload(testBucket, sourcePath, content)
      await storage.copy(testBucket, sourcePath, testBucket, destPath)

      expect(await storage.exists(testBucket, sourcePath)).toBe(true)
      expect(await storage.exists(testBucket, destPath)).toBe(true)

      const copied = await storage.download(testBucket, destPath)
      expect(copied.toString()).toBe('Copy me')
    })

    it('should copy file to different bucket', async () => {
      const content = Buffer.from('Cross bucket')
      const sourcePath = 'file.txt'
      const destBucket = 'other-bucket'

      await storage.upload(testBucket, sourcePath, content)
      await storage.copy(testBucket, sourcePath, destBucket, sourcePath)

      expect(await storage.exists(testBucket, sourcePath)).toBe(true)
      expect(await storage.exists(destBucket, sourcePath)).toBe(true)
    })

    it('should copy metadata', async () => {
      const content = Buffer.from('data')
      const sourcePath = 'with-meta.txt'
      const destPath = 'copied-meta.txt'
      const metadata = { key: 'value' }

      await storage.upload(testBucket, sourcePath, content, { metadata })
      await storage.copy(testBucket, sourcePath, testBucket, destPath)

      const copiedMeta = await storage.getMetadata(testBucket, destPath)
      expect(copiedMeta.metadata).toEqual(metadata)
    })

    it('should create destination directory', async () => {
      const content = Buffer.from('nested copy')
      const sourcePath = 'file.txt'
      const destPath = 'a/b/c/copied.txt'

      await storage.upload(testBucket, sourcePath, content)
      await storage.copy(testBucket, sourcePath, testBucket, destPath)

      expect(await storage.exists(testBucket, destPath)).toBe(true)
    })
  })

  describe('move', () => {
    it('should move file within same bucket', async () => {
      const content = Buffer.from('Move me')
      const sourcePath = 'source.txt'
      const destPath = 'moved.txt'

      await storage.upload(testBucket, sourcePath, content)
      await storage.move(testBucket, sourcePath, testBucket, destPath)

      expect(await storage.exists(testBucket, sourcePath)).toBe(false)
      expect(await storage.exists(testBucket, destPath)).toBe(true)

      const moved = await storage.download(testBucket, destPath)
      expect(moved.toString()).toBe('Move me')
    })

    it('should move file to different bucket', async () => {
      const content = Buffer.from('Cross bucket move')
      const sourcePath = 'file.txt'
      const destBucket = 'other-bucket'

      await storage.upload(testBucket, sourcePath, content)
      await storage.move(testBucket, sourcePath, destBucket, sourcePath)

      expect(await storage.exists(testBucket, sourcePath)).toBe(false)
      expect(await storage.exists(destBucket, sourcePath)).toBe(true)
    })

    it('should move metadata', async () => {
      const content = Buffer.from('data')
      const sourcePath = 'with-meta.txt'
      const destPath = 'moved-meta.txt'
      const metadata = { key: 'value' }

      await storage.upload(testBucket, sourcePath, content, { metadata })
      await storage.move(testBucket, sourcePath, testBucket, destPath)

      const movedMeta = await storage.getMetadata(testBucket, destPath)
      expect(movedMeta.metadata).toEqual(metadata)

      expect(await storage.exists(testBucket, sourcePath)).toBe(false)
    })

    it('should create destination directory', async () => {
      const content = Buffer.from('nested move')
      const sourcePath = 'file.txt'
      const destPath = 'x/y/z/moved.txt'

      await storage.upload(testBucket, sourcePath, content)
      await storage.move(testBucket, sourcePath, testBucket, destPath)

      expect(await storage.exists(testBucket, destPath)).toBe(true)
      expect(await storage.exists(testBucket, sourcePath)).toBe(false)
    })
  })
})
