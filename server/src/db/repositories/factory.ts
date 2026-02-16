/**
 * Repository Factory
 * 根据配置创建不同的 Repository 实现
 */

import type { IClawRepository } from './interfaces/claw.repository.interface.js'
import type { IMessageRepository } from './interfaces/message.repository.interface.js'
import type { IFriendshipRepository } from './interfaces/friendship.repository.interface.js'
import type { IGroupRepository } from './interfaces/group.repository.interface.js'
import type { IUploadRepository } from './interfaces/upload.repository.interface.js'
import type Database from 'better-sqlite3'
import type { SupabaseClient } from '@supabase/supabase-js'

// SQLite 实现
import { SQLiteClawRepository } from './sqlite/claw.repository.js'
import { SQLiteMessageRepository } from './sqlite/message.repository.js'
import { SQLiteFriendshipRepository } from './sqlite/friendship.repository.js'
import { SQLiteGroupRepository } from './sqlite/group.repository.js'
import { SQLiteUploadRepository } from './sqlite/upload.repository.js'

// Supabase 实现
import { SupabaseClawRepository } from './supabase/claw.repository.js'
import { SupabaseMessageRepository } from './supabase/message.repository.js'
import { SupabaseFriendshipRepository } from './supabase/friendship.repository.js'
import { SupabaseGroupRepository } from './supabase/group.repository.js'
import { SupabaseUploadRepository } from './supabase/upload.repository.js'

export type DatabaseType = 'sqlite' | 'supabase'

export interface RepositoryFactoryOptions {
  databaseType: DatabaseType
  sqliteDb?: Database.Database
  supabaseClient?: SupabaseClient
}

/**
 * Repository 工厂类
 * 负责创建所有 Repository 实例
 */
export class RepositoryFactory {
  private databaseType: DatabaseType
  private sqliteDb?: Database.Database
  private supabaseClient?: SupabaseClient

  constructor(options: RepositoryFactoryOptions) {
    this.databaseType = options.databaseType
    this.sqliteDb = options.sqliteDb
    this.supabaseClient = options.supabaseClient

    // 验证配置
    this.validateConfig()
  }

  private validateConfig(): void {
    if (this.databaseType === 'sqlite' && !this.sqliteDb) {
      throw new Error('SQLite database instance is required when databaseType is "sqlite"')
    }
    if (this.databaseType === 'supabase' && !this.supabaseClient) {
      throw new Error('Supabase client is required when databaseType is "supabase"')
    }
  }

  /**
   * 创建 Claw Repository
   */
  createClawRepository(): IClawRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteClawRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseClawRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Message Repository
   */
  createMessageRepository(): IMessageRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteMessageRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseMessageRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Friendship Repository
   */
  createFriendshipRepository(): IFriendshipRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteFriendshipRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseFriendshipRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Group Repository
   */
  createGroupRepository(): IGroupRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteGroupRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseGroupRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Upload Repository
   */
  createUploadRepository(): IUploadRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteUploadRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseUploadRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 获取数据库类型
   */
  getDatabaseType(): DatabaseType {
    return this.databaseType
  }
}
