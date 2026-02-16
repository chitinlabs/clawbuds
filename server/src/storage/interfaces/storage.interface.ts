/**
 * Storage Service Interface
 * 文件存储服务接口，支持本地文件系统、Supabase Storage等多种实现
 */

export interface UploadOptions {
  contentType?: string
  metadata?: Record<string, string>
  cacheControl?: string
}

export interface UploadResult {
  url: string // 公开访问 URL
  path: string // 存储路径
  size: number // 文件大小（字节）
  contentType?: string
}

export interface ListOptions {
  prefix?: string
  limit?: number
  offset?: number
}

export interface FileMetadata {
  path: string
  size: number
  contentType?: string
  lastModified: Date
  metadata?: Record<string, string>
}

export interface IStorageService {
  // ========== 上传 ==========
  /**
   * 上传单个文件
   * @param bucket - 存储桶名称
   * @param path - 文件路径
   * @param file - 文件内容（Buffer 或 Stream）
   * @param options - 上传选项
   */
  upload(bucket: string, path: string, file: Buffer | NodeJS.ReadableStream, options?: UploadOptions): Promise<UploadResult>

  /**
   * 批量上传文件
   */
  uploadMany(
    bucket: string,
    files: Array<{
      path: string
      file: Buffer | NodeJS.ReadableStream
      options?: UploadOptions
    }>
  ): Promise<UploadResult[]>

  // ========== 下载 ==========
  /**
   * 下载文件
   */
  download(bucket: string, path: string): Promise<Buffer>

  // ========== URL 生成 ==========
  /**
   * 获取公开访问 URL
   */
  getPublicUrl(bucket: string, path: string): string

  /**
   * 获取签名 URL（临时访问，用于私有文件）
   * @param expiresIn - 过期时间（秒）
   */
  getSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string>

  // ========== 删除 ==========
  /**
   * 删除单个文件
   */
  delete(bucket: string, path: string): Promise<void>

  /**
   * 批量删除文件
   */
  deleteMany(bucket: string, paths: string[]): Promise<void>

  // ========== 列表 ==========
  /**
   * 列出文件
   */
  list(bucket: string, options?: ListOptions): Promise<FileMetadata[]>

  // ========== 元数据 ==========
  /**
   * 检查文件是否存在
   */
  exists(bucket: string, path: string): Promise<boolean>

  /**
   * 获取文件元数据
   */
  getMetadata(bucket: string, path: string): Promise<FileMetadata>

  // ========== 文件操作 ==========
  /**
   * 复制文件
   */
  copy(sourceBucket: string, sourcePath: string, destBucket: string, destPath: string): Promise<void>

  /**
   * 移动文件
   */
  move(sourceBucket: string, sourcePath: string, destBucket: string, destPath: string): Promise<void>
}
