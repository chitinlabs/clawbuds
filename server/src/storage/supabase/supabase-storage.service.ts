/**
 * Supabase Storage Service
 * 基于 Supabase Storage API 的云端文件存储实现
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IStorageService,
  UploadOptions,
  UploadResult,
  ListOptions,
  FileMetadata,
} from '../interfaces/storage.interface.js'

export class SupabaseStorageService implements IStorageService {
  constructor(private supabase: SupabaseClient) {}

  // ========== 上传 ==========

  async upload(
    bucket: string,
    path: string,
    file: Buffer | NodeJS.ReadableStream,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    // Supabase 支持 Buffer、Blob、File、FormData
    const uploadOptions: any = {}

    if (options?.contentType) {
      uploadOptions.contentType = options.contentType
    }
    if (options?.cacheControl) {
      uploadOptions.cacheControl = options.cacheControl
    }
    if (options?.metadata) {
      uploadOptions.metadata = options.metadata
    }

    // 如果是 Stream，需要转换为 Buffer
    let fileData: Buffer
    if (Buffer.isBuffer(file)) {
      fileData = file
    } else {
      // 从 Stream 读取数据
      const chunks: Buffer[] = []
      for await (const chunk of file) {
        chunks.push(Buffer.from(chunk))
      }
      fileData = Buffer.concat(chunks)
    }

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, fileData, uploadOptions)

    if (error) {
      throw new Error(`Failed to upload file: ${error.message}`)
    }

    // 获取公开 URL
    const publicUrl = this.getPublicUrl(bucket, path)

    return {
      url: publicUrl,
      path: data.path,
      size: fileData.length,
      contentType: options?.contentType,
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

    // Supabase 不支持批量上传 API，需要逐个上传
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
    const { data, error } = await this.supabase.storage.from(bucket).download(path)

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`)
    }

    // Blob 转 Buffer
    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  // ========== URL 生成 ==========

  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`)
    }

    return data.signedUrl
  }

  // ========== 删除 ==========

  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove([path])

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`)
    }
  }

  async deleteMany(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove(paths)

    if (error) {
      throw new Error(`Failed to delete files: ${error.message}`)
    }
  }

  // ========== 列表 ==========

  async list(bucket: string, options?: ListOptions): Promise<FileMetadata[]> {
    const prefix = options?.prefix || ''
    const limit = options?.limit || 1000
    const offset = options?.offset || 0

    const { data, error } = await this.supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) {
      throw new Error(`Failed to list files: ${error.message}`)
    }

    return (data || []).map((item) => ({
      path: prefix ? `${prefix}/${item.name}` : item.name,
      size: item.metadata?.size || 0,
      contentType: item.metadata?.mimetype,
      lastModified: new Date(item.updated_at || item.created_at),
      metadata: item.metadata,
    }))
  }

  // ========== 元数据 ==========

  async exists(bucket: string, path: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage.from(bucket).download(path)

      if (error) {
        return false
      }

      return data !== null
    } catch {
      return false
    }
  }

  async getMetadata(bucket: string, path: string): Promise<FileMetadata> {
    // Supabase 没有直接获取元数据的 API，需要通过 list 来获取
    const pathParts = path.split('/')
    const fileName = pathParts.pop()
    const prefix = pathParts.join('/')

    const { data, error } = await this.supabase.storage.from(bucket).list(prefix, {
      search: fileName,
    })

    if (error) {
      throw new Error(`Failed to get metadata: ${error.message}`)
    }

    const fileItem = data?.find((item) => item.name === fileName)
    if (!fileItem) {
      throw new Error('File not found')
    }

    return {
      path,
      size: fileItem.metadata?.size || 0,
      contentType: fileItem.metadata?.mimetype,
      lastModified: new Date(fileItem.updated_at || fileItem.created_at),
      metadata: fileItem.metadata,
    }
  }

  // ========== 文件操作 ==========

  async copy(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string,
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(sourceBucket)
      .copy(sourcePath, `${destBucket}/${destPath}`)

    if (error) {
      throw new Error(`Failed to copy file: ${error.message}`)
    }
  }

  async move(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string,
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(sourceBucket)
      .move(sourcePath, `${destBucket}/${destPath}`)

    if (error) {
      throw new Error(`Failed to move file: ${error.message}`)
    }
  }
}
