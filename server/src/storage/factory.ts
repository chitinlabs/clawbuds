/**
 * Storage Factory
 * 根据配置创建不同的存储服务实现
 */

import type { IStorageService } from './interfaces/storage.interface.js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Storage 实现
import { LocalStorageService } from './local/local-storage.service.js'
import { SupabaseStorageService } from './supabase/supabase-storage.service.js'

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
        return new LocalStorageService({
          rootDir: options.localConfig.baseDir,
          baseUrl: options.localConfig.publicUrl,
        })

      case 'supabase':
        if (!options.supabaseClient) {
          throw new Error('Supabase client is required when storageType is "supabase"')
        }
        return new SupabaseStorageService(options.supabaseClient)

      default:
        throw new Error(`Unsupported storage type: ${options.storageType}`)
    }
  }
}
