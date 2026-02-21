#!/usr/bin/env node
/**
 * Phase 9 迁移脚本：对所有已有 Pearl 执行一次性 Luster 重算
 *
 * 升级内容：Phase 3 等权平均 → Phase 9 信任加权版（含 Thread 引用计数加成）
 *
 * 运行方式：
 *   DATABASE_TYPE=sqlite pnpm tsx src/scripts/recalculate-luster.ts
 */

import 'dotenv/config'
import { createDatabase } from '../db/database.js'
import { config } from '../config/env.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { SQLitePearlRepository } from '../db/repositories/sqlite/pearl.repository.js'
import { SQLitePearlEndorsementRepository } from '../db/repositories/sqlite/pearl-endorsement.repository.js'
import { SQLiteThreadContributionRepository } from '../db/repositories/sqlite/thread-contribution.repository.js'
import { PearlService } from '../services/pearl.service.js'

async function main(): Promise<void> {
  console.log('🔄 Phase 9 Luster 重算迁移开始...')
  console.log(`Database path: ${config.databasePath}`)

  mkdirSync(dirname(config.databasePath), { recursive: true })
  const db = createDatabase(config.databasePath)

  const pearlRepo = new SQLitePearlRepository(db)
  const endorsementRepo = new SQLitePearlEndorsementRepository(db)
  const threadContribRepo = new SQLiteThreadContributionRepository(db)

  // trustService 为 undefined：迁移时无法查到 trust scores（SQLite 无法跨节点），退化为等权版
  // 如需信任加权，请在 Supabase 环境下运行（DATABASE_TYPE=supabase）
  const pearlService = new PearlService(
    pearlRepo,
    endorsementRepo,
    {} as never,   // friendshipService not needed for migration
    { emit: () => {}, on: () => {}, off: () => {}, removeAllListeners: () => {} } as never,
    undefined,     // trustService: optional, skipped in migration for simplicity
    threadContribRepo,
  )

  const count = await pearlService.recalculateAllLuster()

  console.log(`\n✅ 已重算 ${count} 个 Pearl 的 Luster`)
  db.close()
  console.log('✅ Luster 重算迁移完成！')
}

main().catch(err => {
  console.error('❌ 迁移失败:', err)
  process.exit(1)
})
