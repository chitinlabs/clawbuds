import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  IUploadRepository,
  UploadProfile,
} from '../db/repositories/interfaces/upload.repository.interface.js'
import type { IStorageService } from '../storage/interfaces/storage.interface.js'

// Re-export types for convenience
export type { UploadProfile } from '../db/repositories/interfaces/upload.repository.interface.js'

const UPLOAD_BUCKET = 'uploads'

export class UploadService {
  private uploadDir: string

  constructor(
    private uploadRepository: IUploadRepository,
    uploadDir: string,
    private storageService?: IStorageService,
  ) {
    this.uploadDir = uploadDir
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }
  }

  getUploadDir(): string {
    return this.uploadDir
  }

  getStorageService(): IStorageService | undefined {
    return this.storageService
  }

  /**
   * Check if using a remote storage backend (e.g. Supabase Storage)
   * vs local filesystem storage
   */
  isRemoteStorage(): boolean {
    if (!this.storageService) return false
    // LocalStorageService uses local filesystem, everything else is "remote"
    return this.storageService.constructor.name !== 'LocalStorageService'
  }

  async upload(
    ownerId: string,
    filename: string,
    mimeType: string,
    size: number,
    storedPath: string,
  ): Promise<UploadProfile> {
    const id = randomUUID()

    // If using remote storage (e.g. Supabase), upload the file from disk
    if (this.isRemoteStorage()) {
      const localFilePath = join(this.uploadDir, storedPath)
      if (existsSync(localFilePath)) {
        const fileBuffer = await readFile(localFilePath)
        await this.storageService!.upload(UPLOAD_BUCKET, storedPath, fileBuffer, {
          contentType: mimeType,
        })
        // Clean up local temp file after successful remote upload
        try { await unlink(localFilePath) } catch { /* ignore */ }
      }
    }

    return await this.uploadRepository.create({
      id,
      ownerId,
      filename,
      mimeType,
      size,
      path: storedPath,
    })
  }

  async findById(id: string): Promise<UploadProfile | null> {
    return await this.uploadRepository.findById(id)
  }

  async getFilePath(id: string): Promise<string | null> {
    const upload = await this.findById(id)
    if (!upload) return null
    return join(this.uploadDir, upload.path)
  }

  /**
   * Get the download URL for a file.
   * For remote storage: returns the public URL from the storage service.
   * For local storage: returns null (caller should serve from disk).
   */
  async getFileUrl(id: string): Promise<string | null> {
    const upload = await this.findById(id)
    if (!upload) return null
    if (this.isRemoteStorage()) {
      return this.storageService!.getPublicUrl(UPLOAD_BUCKET, upload.path)
    }
    return null
  }

  async deleteUpload(id: string, ownerId: string): Promise<void> {
    const upload = await this.findById(id)
    if (!upload) {
      throw new UploadError('NOT_FOUND', 'Upload not found')
    }
    if (upload.ownerId !== ownerId) {
      throw new UploadError('NOT_AUTHORIZED', 'Can only delete your own uploads')
    }
    if (this.storageService) {
      try {
        await this.storageService.delete(UPLOAD_BUCKET, upload.path)
      } catch {
        // File may already be deleted from storage, continue with DB cleanup
      }
    }
    await this.uploadRepository.delete(id, ownerId)
  }
}

export class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}
