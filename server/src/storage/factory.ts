/**
 * Storage Factory
 * 根据配置创建不同的存储服务实现
 */

import type { IStorageService } from './interfaces/storage.interface.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type StorageType = 'local' | 'supabase'

export interface LocalStorageConfig {
  baseDir: string // 例如: ./uploads
  publicUrl: string // 例如: http://localhost:8765/uploads
}

export interface StorageFactoryOptions {
  storageType: StorageType
  localConfig?: LocalStorageConfig
  supabaseClient?: SupabaseClient
}

/**
 * Storage 工厂类
 * 负责创建存储服务实例
 */
export class StorageFactory {
  /**
   * 创建 Storage 服务实例
   */
  static create(options: StorageFactoryOptions): IStorageService {
    switch (options.storageType) {
      case 'local':
        if (!options.localConfig) {
          throw new Error('Local storage config is required when storageType is "local"')
        }
        // 将在 Phase 3 实现
        throw new Error('Local Storage not implemented yet')

      case 'supabase':
        if (!options.supabaseClient) {
          throw new Error('Supabase client is required when storageType is "supabase"')
        }
        // 将在 Phase 3 实现
        throw new Error('Supabase Storage not implemented yet')

      default:
        throw new Error(`Unsupported storage type: ${options.storageType}`)
    }
  }
}
