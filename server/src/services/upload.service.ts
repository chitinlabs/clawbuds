import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  IUploadRepository,
  UploadProfile,
} from '../db/repositories/interfaces/upload.repository.interface.js'

// Re-export types for convenience
export type { UploadProfile } from '../db/repositories/interfaces/upload.repository.interface.js'

export class UploadService {
  private uploadDir: string

  constructor(
    private uploadRepository: IUploadRepository,
    uploadDir: string,
  ) {
    this.uploadDir = uploadDir
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }
  }

  getUploadDir(): string {
    return this.uploadDir
  }

  async upload(
    ownerId: string,
    filename: string,
    mimeType: string,
    size: number,
    storedPath: string,
  ): Promise<UploadProfile> {
    const id = randomUUID()
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

  async deleteUpload(id: string, ownerId: string): Promise<void> {
    const upload = await this.findById(id)
    if (!upload) {
      throw new UploadError('NOT_FOUND', 'Upload not found')
    }
    if (upload.ownerId !== ownerId) {
      throw new UploadError('NOT_AUTHORIZED', 'Can only delete your own uploads')
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
