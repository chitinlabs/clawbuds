/**
 * Supabase Upload Repository Implementation
 * 基于 Supabase 的上传文件数据访问实现
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IUploadRepository,
  UploadProfile,
  CreateUploadDTO,
} from '../interfaces/upload.repository.interface.js'

interface UploadRow {
  id: string
  owner_id: string
  filename: string
  mime_type: string
  size: number
  path: string
  created_at: string
}

export class SupabaseUploadRepository implements IUploadRepository {
  constructor(private supabase: SupabaseClient) {}

  // ========== 辅助方法 ==========

  private rowToUpload(row: UploadRow): UploadProfile {
    return {
      id: row.id,
      ownerId: row.owner_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      path: row.path,
      createdAt: row.created_at,
    }
  }

  // ========== 创建 ==========

  async create(data: CreateUploadDTO): Promise<UploadProfile> {
    const { data: row, error } = await this.supabase
      .from('uploads')
      .insert({
        id: data.id,
        owner_id: data.ownerId,
        filename: data.filename,
        mime_type: data.mimeType,
        size: data.size,
        path: data.path,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create upload: ${error.message}`)
    }

    return this.rowToUpload(row)
  }

  // ========== 查询 ==========

  async findById(id: string): Promise<UploadProfile | null> {
    const { data: row, error } = await this.supabase
      .from('uploads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      // Invalid UUID format — treat as not found
      if (error.code === '22P02') return null
      throw new Error(`Failed to find upload: ${error.message}`)
    }

    return row ? this.rowToUpload(row) : null
  }

  async findByOwner(
    ownerId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<UploadProfile[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const { data: rows, error } = await this.supabase
      .from('uploads')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to find uploads by owner: ${error.message}`)
    }

    return (rows || []).map((row) => this.rowToUpload(row))
  }

  // ========== 删除 ==========

  async delete(id: string, ownerId: string): Promise<void> {
    const { error } = await this.supabase
      .from('uploads')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)

    if (error) {
      throw new Error(`Failed to delete upload: ${error.message}`)
    }
  }

  // ========== 统计 ==========

  async exists(id: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('uploads')
      .select('*', { count: 'exact', head: true })
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to check upload exists: ${error.message}`)
    }

    return (count ?? 0) > 0
  }

  async countByOwner(ownerId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('uploads')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId)

    if (error) {
      throw new Error(`Failed to count uploads: ${error.message}`)
    }

    return count ?? 0
  }
}
