/**
 * Repository Factory
 * 根据配置创建不同的 Repository 实现
 */

import type { IClawRepository } from './interfaces/claw.repository.interface.js'
import type { IMessageRepository } from './interfaces/message.repository.interface.js'
import type { IFriendshipRepository } from './interfaces/friendship.repository.interface.js'
import type { IGroupRepository } from './interfaces/group.repository.interface.js'
import type Database from 'better-sqlite3'
import type { SupabaseClient } from '@supabase/supabase-js'

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
        // 将在 Phase 2 实现
        throw new Error('SQLite Claw Repository not implemented yet')
      case 'supabase':
        // 将在 Phase 2 实现
        throw new Error('Supabase Claw Repository not implemented yet')
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
        throw new Error('SQLite Message Repository not implemented yet')
      case 'supabase':
        throw new Error('Supabase Message Repository not implemented yet')
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
        throw new Error('SQLite Friendship Repository not implemented yet')
      case 'supabase':
        throw new Error('Supabase Friendship Repository not implemented yet')
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
        throw new Error('SQLite Group Repository not implemented yet')
      case 'supabase':
        throw new Error('Supabase Group Repository not implemented yet')
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
