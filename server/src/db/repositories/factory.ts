/**
 * Repository Factory
 * 根据配置创建不同的 Repository 实现
 */

import type { IClawRepository } from './interfaces/claw.repository.interface.js'
import type { IMessageRepository } from './interfaces/message.repository.interface.js'
import type { IFriendshipRepository } from './interfaces/friendship.repository.interface.js'
import type { IGroupRepository } from './interfaces/group.repository.interface.js'
import type { IUploadRepository } from './interfaces/upload.repository.interface.js'
import type { IGroupDataAccess } from './interfaces/group-data-access.interface.js'
import type { ICircleRepository } from './interfaces/circle.repository.interface.js'
import type { IReactionRepository } from './interfaces/reaction.repository.interface.js'
import type { IStatsRepository } from './interfaces/stats.repository.interface.js'
import type { IPollRepository } from './interfaces/poll.repository.interface.js'
import type { IDiscoveryRepository } from './interfaces/discovery.repository.interface.js'
import type { IE2eeRepository } from './interfaces/e2ee.repository.interface.js'
import type { IInboxRepository } from './interfaces/inbox.repository.interface.js'
import type { IWebhookRepository } from './interfaces/webhook.repository.interface.js'
import type { IHeartbeatRepository } from './interfaces/heartbeat.repository.interface.js'
import type { IRelationshipStrengthRepository } from './interfaces/relationship-strength.repository.interface.js'
import type { IFriendModelRepository } from './interfaces/friend-model.repository.interface.js'
import type { IPearlRepository, IPearlEndorsementRepository } from './interfaces/pearl.repository.interface.js'
import type { IReflexRepository, IReflexExecutionRepository } from './interfaces/reflex.repository.interface.js'
import type { IImprintRepository } from './interfaces/imprint.repository.interface.js'
import type { IBriefingRepository } from './interfaces/briefing.repository.interface.js'
import type { ITrustRepository } from './interfaces/trust.repository.interface.js'
import type Database from 'better-sqlite3'
import type { SupabaseClient } from '@supabase/supabase-js'

// SQLite 实现
import { SQLiteClawRepository } from './sqlite/claw.repository.js'
import { SQLiteMessageRepository } from './sqlite/message.repository.js'
import { SQLiteFriendshipRepository } from './sqlite/friendship.repository.js'
import { SQLiteGroupRepository } from './sqlite/group.repository.js'
import { SQLiteUploadRepository } from './sqlite/upload.repository.js'
import { SQLiteGroupDataAccess } from './sqlite/group-data-access.js'
import { SqliteCircleRepository } from './sqlite/circle.repository.js'
import { SqliteReactionRepository } from './sqlite/reaction.repository.js'
import { SqliteStatsRepository } from './sqlite/stats.repository.js'
import { SqlitePollRepository } from './sqlite/poll.repository.js'
import { SqliteDiscoveryRepository } from './sqlite/discovery.repository.js'
import { SqliteE2eeRepository } from './sqlite/e2ee.repository.js'
import { SqliteInboxRepository } from './sqlite/inbox.repository.js'
import { SqliteWebhookRepository } from './sqlite/webhook.repository.js'
import { SQLiteHeartbeatRepository } from './sqlite/heartbeat.repository.js'
import { SQLiteRelationshipStrengthRepository } from './sqlite/relationship-strength.repository.js'
import { SQLiteFriendModelRepository } from './sqlite/friend-model.repository.js'
import { SQLitePearlRepository } from './sqlite/pearl.repository.js'
import { SQLitePearlEndorsementRepository } from './sqlite/pearl-endorsement.repository.js'
import { SQLiteReflexRepository } from './sqlite/reflex.repository.js'
import { SQLiteReflexExecutionRepository } from './sqlite/reflex-execution.repository.js'

// Supabase 实现
import { SupabaseClawRepository } from './supabase/claw.repository.js'
import { SupabaseMessageRepository } from './supabase/message.repository.js'
import { SupabaseFriendshipRepository } from './supabase/friendship.repository.js'
import { SupabaseGroupRepository } from './supabase/group.repository.js'
import { SupabaseUploadRepository } from './supabase/upload.repository.js'
import { SupabaseCircleRepository } from './supabase/circle.repository.js'
import { SupabaseReactionRepository } from './supabase/reaction.repository.js'
import { SupabaseStatsRepository } from './supabase/stats.repository.js'
import { SupabasePollRepository } from './supabase/poll.repository.js'
import { SupabaseDiscoveryRepository } from './supabase/discovery.repository.js'
import { SupabaseE2eeRepository } from './supabase/e2ee.repository.js'
import { SupabaseInboxRepository } from './supabase/inbox.repository.js'
import { SupabaseWebhookRepository } from './supabase/webhook.repository.js'
import { SupabaseGroupDataAccess } from './supabase/group-data-access.js'
import { SupabaseHeartbeatRepository } from './supabase/heartbeat.repository.js'
import { SupabaseRelationshipStrengthRepository } from './supabase/relationship-strength.repository.js'
import { SupabaseFriendModelRepository } from './supabase/friend-model.repository.js'
import { SupabasePearlRepository } from './supabase/pearl.repository.js'
import { SupabasePearlEndorsementRepository } from './supabase/pearl-endorsement.repository.js'
import { SupabaseReflexRepository } from './supabase/reflex.repository.js'
import { SupabaseReflexExecutionRepository } from './supabase/reflex-execution.repository.js'
import { SQLiteImprintRepository } from './sqlite/imprint.repository.js'
import { SupabaseImprintRepository } from './supabase/imprint.repository.js'
import { SQLiteBriefingRepository } from './sqlite/briefing.repository.js'
import { SupabaseBriefingRepository } from './supabase/briefing.repository.js'
import { SQLiteTrustRepository } from './sqlite/trust.repository.js'
import { SupabaseTrustRepository } from './supabase/trust.repository.js'
import type {
  IThreadRepository,
  IThreadContributionRepository,
  IThreadKeyRepository,
} from './interfaces/thread.repository.interface.js'
import { SQLiteThreadRepository } from './sqlite/thread.repository.js'
import { SQLiteThreadContributionRepository } from './sqlite/thread-contribution.repository.js'
import { SQLiteThreadKeyRepository } from './sqlite/thread-key.repository.js'
import { SupabaseThreadRepository } from './supabase/thread.repository.js'
import { SupabaseThreadContributionRepository } from './supabase/thread-contribution.repository.js'
import { SupabaseThreadKeyRepository } from './supabase/thread-key.repository.js'

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
   * 创建 Group Data Access (轻量级数据访问层)
   */
  createGroupDataAccess(): IGroupDataAccess {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteGroupDataAccess(this.sqliteDb!)
      case 'supabase':
        return new SupabaseGroupDataAccess(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Circle Repository
   */
  createCircleRepository(): ICircleRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteCircleRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseCircleRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Reaction Repository
   */
  createReactionRepository(): IReactionRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteReactionRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseReactionRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Stats Repository
   */
  createStatsRepository(): IStatsRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteStatsRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseStatsRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Poll Repository
   */
  createPollRepository(): IPollRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqlitePollRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabasePollRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Discovery Repository
   */
  createDiscoveryRepository(): IDiscoveryRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteDiscoveryRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseDiscoveryRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 E2ee Repository
   */
  createE2eeRepository(): IE2eeRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteE2eeRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseE2eeRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Inbox Repository
   */
  createInboxRepository(): IInboxRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteInboxRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseInboxRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Webhook Repository
   */
  createWebhookRepository(): IWebhookRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SqliteWebhookRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseWebhookRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 Heartbeat Repository（Phase 1）
   */
  createHeartbeatRepository(): IHeartbeatRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteHeartbeatRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseHeartbeatRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 RelationshipStrength Repository（Phase 1）
   */
  createRelationshipStrengthRepository(): IRelationshipStrengthRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteRelationshipStrengthRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseRelationshipStrengthRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 FriendModel Repository（Phase 2）
   */
  createFriendModelRepository(): IFriendModelRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteFriendModelRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseFriendModelRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ReflexRepository（Phase 4）
   */
  createReflexRepository(): IReflexRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteReflexRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseReflexRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ReflexExecutionRepository（Phase 4）
   */
  createReflexExecutionRepository(): IReflexExecutionRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteReflexExecutionRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseReflexExecutionRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 PearlRepository（Phase 3）
   */
  createPearlRepository(): IPearlRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLitePearlRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabasePearlRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 PearlEndorsementRepository（Phase 3）
   */
  createPearlEndorsementRepository(): IPearlEndorsementRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLitePearlEndorsementRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabasePearlEndorsementRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ImprintRepository（Phase 5）
   */
  createImprintRepository(): IImprintRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteImprintRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseImprintRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 BriefingRepository（Phase 6）
   */
  createBriefingRepository(): IBriefingRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteBriefingRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseBriefingRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 TrustRepository（Phase 7）
   */
  createTrustRepository(): ITrustRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteTrustRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseTrustRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ThreadRepository（Phase 8）
   */
  createThreadRepository(): IThreadRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteThreadRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseThreadRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ThreadContributionRepository（Phase 8）
   */
  createThreadContributionRepository(): IThreadContributionRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteThreadContributionRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseThreadContributionRepository(this.supabaseClient!)
      default:
        throw new Error(`Unsupported database type: ${this.databaseType}`)
    }
  }

  /**
   * 创建 ThreadKeyRepository（Phase 8）
   */
  createThreadKeyRepository(): IThreadKeyRepository {
    switch (this.databaseType) {
      case 'sqlite':
        return new SQLiteThreadKeyRepository(this.sqliteDb!)
      case 'supabase':
        return new SupabaseThreadKeyRepository(this.supabaseClient!)
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
