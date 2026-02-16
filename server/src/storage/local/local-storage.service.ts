/**
 * Local File System Storage Service
 * 基于 Node.js fs 模块的本地文件存储实现
 */

import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  readdir,
  stat,
  copyFile,
  rename,
  access,
} from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type {
  IStorageService,
  UploadOptions,
  UploadResult,
  ListOptions,
  FileMetadata,
} from '../interfaces/storage.interface.js'

export interface LocalStorageOptions {
  /** 存储根目录 */
  rootDir: string
  /** 公开访问的基础 URL（用于生成公开 URL） */
  baseUrl?: string
}

export class LocalStorageService implements IStorageService {
  private rootDir: string
  private baseUrl: string

  constructor(options: LocalStorageOptions) {
    this.rootDir = options.rootDir
    this.baseUrl = options.baseUrl || 'http://localhost:3000/storage'
  }

  // ========== 辅助方法 ==========

  /**
   * 获取 bucket 的完整路径
   */
  private getBucketPath(bucket: string): string {
    return join(this.rootDir, bucket)
  }

  /**
   * 获取文件的完整路径
   */
  private getFilePath(bucket: string, path: string): string {
    return join(this.rootDir, bucket, path)
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true })
  }

  /**
   * 检测内容类型
   */
  private detectContentType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      json: 'application/json',
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    }
    return mimeTypes[ext || ''] || 'application/octet-stream'
  }

  // ========== 上传 ==========

  async upload(
    bucket: string,
    path: string,
    file: Buffer | NodeJS.ReadableStream,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    const filePath = this.getFilePath(bucket, path)
    const fileDir = dirname(filePath)

    // 确保目录存在
    await this.ensureDir(fileDir)

    // 写入文件
    let size: number
    if (Buffer.isBuffer(file)) {
      await writeFile(filePath, file)
      size = file.length
    } else {
      // Stream
      const writeStream = createWriteStream(filePath)
      await pipeline(file, writeStream)
      const stats = await stat(filePath)
      size = stats.size
    }

    const contentType = options?.contentType || this.detectContentType(path)

    // 如果有元数据，存储到同名 .meta.json 文件
    if (options?.metadata) {
      const metaPath = `${filePath}.meta.json`
      await writeFile(metaPath, JSON.stringify(options.metadata))
    }

    return {
      url: this.getPublicUrl(bucket, path),
      path,
      size,
      contentType,
    }
  }

  async uploadMany(
    bucket: string,
    files: Array<{
      path: string
      file: Buffer | NodeJS.ReadableStream
      options?: UploadOptions
    }>,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = []

    for (const fileItem of files) {
      const result = await this.upload(
        bucket,
        fileItem.path,
        fileItem.file,
        fileItem.options,
      )
      results.push(result)
    }

    return results
  }

  // ========== 下载 ==========

  async download(bucket: string, path: string): Promise<Buffer> {
    const filePath = this.getFilePath(bucket, path)
    return readFile(filePath)
  }

  // ========== URL 生成 ==========

  getPublicUrl(bucket: string, path: string): string {
    return `${this.baseUrl}/${bucket}/${path}`
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number,
  ): Promise<string> {
    // 本地文件系统不需要签名 URL，直接返回公开 URL
    // 在实际应用中，可以生成带有时间戳和签名的 URL
    const timestamp = Date.now() + expiresIn * 1000
    return `${this.getPublicUrl(bucket, path)}?expires=${timestamp}`
  }

  // ========== 删除 ==========

  async delete(bucket: string, path: string): Promise<void> {
    const filePath = this.getFilePath(bucket, path)

    try {
      await unlink(filePath)
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }

    // 删除元数据文件（如果存在）
    const metaPath = `${filePath}.meta.json`
    try {
      await unlink(metaPath)
    } catch {
      // 忽略元数据文件不存在的错误
    }
  }

  async deleteMany(bucket: string, paths: string[]): Promise<void> {
    for (const path of paths) {
      await this.delete(bucket, path)
    }
  }

  // ========== 列表 ==========

  async list(bucket: string, options?: ListOptions): Promise<FileMetadata[]> {
    const bucketPath = this.getBucketPath(bucket)
    const prefix = options?.prefix || ''
    const limit = options?.limit || 1000
    const offset = options?.offset || 0

    const searchPath = prefix ? join(bucketPath, prefix) : bucketPath

    try {
      await access(searchPath)
    } catch {
      return [] // 目录不存在，返回空列表
    }

    const files: FileMetadata[] = []
    await this.listRecursive(bucketPath, searchPath, files, bucket)

    // 应用分页
    return files.slice(offset, offset + limit)
  }

  private async listRecursive(
    bucketPath: string,
    currentPath: string,
    files: FileMetadata[],
    bucket: string,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        await this.listRecursive(bucketPath, fullPath, files, bucket)
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        const stats = await stat(fullPath)
        const relativePath = fullPath.substring(bucketPath.length + 1)

        // 读取元数据（如果存在）
        let metadata: Record<string, string> | undefined
        const metaPath = `${fullPath}.meta.json`
        try {
          const metaContent = await readFile(metaPath, 'utf-8')
          metadata = JSON.parse(metaContent)
        } catch {
          // 元数据文件不存在
        }

        files.push({
          path: relativePath,
          size: stats.size,
          contentType: this.detectContentType(relativePath),
          lastModified: stats.mtime,
          metadata,
        })
      }
    }
  }

  // ========== 元数据 ==========

  async exists(bucket: string, path: string): Promise<boolean> {
    const filePath = this.getFilePath(bucket, path)
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }

  async getMetadata(bucket: string, path: string): Promise<FileMetadata> {
    const filePath = this.getFilePath(bucket, path)
    const stats = await stat(filePath)

    // 读取元数据（如果存在）
    let metadata: Record<string, string> | undefined
    const metaPath = `${filePath}.meta.json`
    try {
      const metaContent = await readFile(metaPath, 'utf-8')
      metadata = JSON.parse(metaContent)
    } catch {
      // 元数据文件不存在
    }

    return {
      path,
      size: stats.size,
      contentType: this.detectContentType(path),
      lastModified: stats.mtime,
      metadata,
    }
  }

  // ========== 文件操作 ==========

  async copy(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string,
  ): Promise<void> {
    const sourceFilePath = this.getFilePath(sourceBucket, sourcePath)
    const destFilePath = this.getFilePath(destBucket, destPath)
    const destDir = dirname(destFilePath)

    await this.ensureDir(destDir)
    await copyFile(sourceFilePath, destFilePath)

    // 复制元数据文件（如果存在）
    const sourceMetaPath = `${sourceFilePath}.meta.json`
    const destMetaPath = `${destFilePath}.meta.json`
    try {
      await copyFile(sourceMetaPath, destMetaPath)
    } catch {
      // 元数据文件不存在，忽略
    }
  }

  async move(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string,
  ): Promise<void> {
    const sourceFilePath = this.getFilePath(sourceBucket, sourcePath)
    const destFilePath = this.getFilePath(destBucket, destPath)
    const destDir = dirname(destFilePath)

    await this.ensureDir(destDir)
    await rename(sourceFilePath, destFilePath)

    // 移动元数据文件（如果存在）
    const sourceMetaPath = `${sourceFilePath}.meta.json`
    const destMetaPath = `${destFilePath}.meta.json`
    try {
      await rename(sourceMetaPath, destMetaPath)
    } catch {
      // 元数据文件不存在，忽略
    }
  }
}
