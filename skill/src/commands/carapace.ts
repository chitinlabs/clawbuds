/**
 * carapace 命令（Phase 10 + Phase 12b）
 * clawbuds carapace show               — 查看本地 carapace.md 内容
 * clawbuds carapace allow              — 追加授权规则到本地文件，推送快照
 * clawbuds carapace escalate           — 追加升级规则到本地文件，推送快照
 * clawbuds carapace history            — 查看服务器修改历史
 * clawbuds carapace diff <version>     — 对比本地文件与服务器版本
 * clawbuds carapace restore <version>  — 从服务器获取版本，写入本地文件，推送快照
 *
 * Phase 12b: server 不再持有 carapace.md，所有文件操作在客户端完成。
 * 修改后调用 POST /carapace/snapshot 将新版本推送到服务器历史。
 */

import { Command } from 'commander'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const carapaceCommand = new Command('carapace').description('Manage carapace.md evolution')

addProfileOption(carapaceCommand)

// ─── 本地 carapace.md 路径工具 ────────────────────────────────────────────────

function getCarapaceFilePath(): string {
  const configDir = process.env['CLAWBUDS_CONFIG_DIR'] ?? join(homedir(), '.clawbuds')
  return join(configDir, 'references', 'carapace.md')
}

function readLocalCarapace(): string {
  const filePath = getCarapaceFilePath()
  if (!existsSync(filePath)) return ''
  return readFileSync(filePath, 'utf-8')
}

function writeLocalCarapace(content: string): void {
  const filePath = getCarapaceFilePath()
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
}

// ─── carapace show ────────────────────────────────────────────────────────────

carapaceCommand
  .command('show')
  .description('Show local carapace.md content')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    try {
      const content = readLocalCarapace()
      if (!content) {
        info('本地 carapace.md 为空或不存在。使用 `clawbuds carapace restore` 从服务器获取历史版本。')
        return
      }
      info('─'.repeat(60))
      info(content)
      info('─'.repeat(60))
      info('使用 `clawbuds carapace allow` 或 `clawbuds carapace escalate` 快速追加规则')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`读取 carapace.md 失败: ${message}`)
    }
  })

// ─── carapace allow ───────────────────────────────────────────────────────────

carapaceCommand
  .command('allow')
  .description('Append an allow rule to local carapace.md and push snapshot')
  .requiredOption('--friend <id>', 'Friend claw ID')
  .requiredOption('--scope <scope>', 'Scope description (e.g. "日常梳理消息")')
  .option('--note <note>', 'Reason or note for this rule')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const current = readLocalCarapace()
      const noteStr = opts.note ? ` — ${opts.note}` : ''
      const rule = `\n## Allow: ${opts.friend}\n\n- 范围：${opts.scope}${noteStr}\n`
      const updated = current + rule

      writeLocalCarapace(updated)
      const result = await client.pushCarapaceSnapshot(updated, 'allow')
      success(`已添加授权规则（carapace.md 版本 ${result.version}）`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`添加授权规则失败: ${message}`)
    }
  })

// ─── carapace escalate ────────────────────────────────────────────────────────

carapaceCommand
  .command('escalate')
  .description('Append an escalate rule to local carapace.md and push snapshot')
  .requiredOption('--when <condition>', 'Condition for escalation (e.g. "Pearl 涉及金融话题")')
  .requiredOption('--action <action>', 'Action to take (e.g. "需要人工审阅")')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const current = readLocalCarapace()
      const rule = `\n## Escalate\n\n- 条件：${opts.when}\n- 操作：${opts.action}\n`
      const updated = current + rule

      writeLocalCarapace(updated)
      const result = await client.pushCarapaceSnapshot(updated, 'escalate')
      success(`已添加升级规则（carapace.md 版本 ${result.version}）`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`添加升级规则失败: ${message}`)
    }
  })

// ─── carapace history ────────────────────────────────────────────────────────

carapaceCommand
  .command('history')
  .description('View carapace.md modification history (from server)')
  .option('--limit <n>', 'Number of entries to show', '20')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      const records = await client.getCarapaceHistory({ limit: parseInt(opts.limit, 10) })
      if (!records || (records as unknown[]).length === 0) {
        info('暂无 carapace.md 修改历史。')
        return
      }

      info(`carapace.md 修改历史（共 ${(records as unknown[]).length} 个版本）`)
      info('─'.repeat(60))
      info('版本  时间                  变更类型      说明')
      info('─'.repeat(60))
      for (const r of records as Array<Record<string, unknown>>) {
        const date = String(r['createdAt']).slice(0, 16).replace('T', ' ')
        const reason = String(r['changeReason'])
        const reasonZh: Record<string, string> = {
          micro_molt: 'Micro-Molt',
          manual_edit: '手动编辑',
          allow: 'Allow 规则',
          escalate: 'Escalate 规则',
          restore: '版本回滚',
        }
        info(`${String(r['version']).padEnd(6)}${date.padEnd(22)}${(reasonZh[reason] ?? reason).padEnd(14)}v${r['version']}`)
      }
      info('')
      info('使用 `clawbuds carapace diff <版本>` 查看变更详情')
      info('使用 `clawbuds carapace restore <版本>` 回滚')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`获取历史失败: ${message}`)
    }
  })

// ─── carapace diff ───────────────────────────────────────────────────────────

carapaceCommand
  .command('diff <version>')
  .description('Show diff between local carapace.md and a specific version')
  .action(async (version, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const versionNum = parseInt(version, 10)
    if (isNaN(versionNum)) {
      error(`Invalid version number: ${version}`)
      return
    }

    try {
      const [localContent, targetRecord] = await Promise.all([
        Promise.resolve(readLocalCarapace()),
        client.getCarapaceVersion(versionNum),
      ])

      if (!targetRecord) {
        error(`版本 ${versionNum} 不存在`)
        return
      }

      const target = targetRecord as Record<string, unknown>

      info(`carapace.md 本地 → 版本 ${versionNum}`)
      info('')

      const targetLines = String(target['content']).split('\n')
      const localLines = localContent.split('\n')

      const targetSet = new Set(targetLines)
      const localSet = new Set(localLines)

      let hasDiff = false
      for (const line of localLines) {
        if (!targetSet.has(line) && line.trim()) {
          info(`+ ${line}`)
          hasDiff = true
        }
      }
      for (const line of targetLines) {
        if (!localSet.has(line) && line.trim()) {
          info(`- ${line}`)
          hasDiff = true
        }
      }

      if (!hasDiff) {
        info('（无差异）')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`获取 diff 失败: ${message}`)
    }
  })

// ─── carapace restore ─────────────────────────────────────────────────────────

carapaceCommand
  .command('restore <version>')
  .description('Restore local carapace.md from server version and push snapshot')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (version, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    const versionNum = parseInt(version, 10)
    if (isNaN(versionNum)) {
      error(`Invalid version number: ${version}`)
      return
    }

    if (!opts.yes) {
      const { createInterface } = await import('node:readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const confirmed = await new Promise<boolean>((resolve) => {
        rl.question(
          `? 确认从服务器版本 ${versionNum} 恢复本地 carapace.md？[y/N] `,
          (ans) => {
            rl.close()
            resolve(ans.toLowerCase() === 'y')
          },
        )
      })
      if (!confirmed) {
        info('已取消。')
        return
      }
    }

    try {
      // 1. 从服务器获取版本内容
      const restored = await client.restoreCarapaceVersion(versionNum)
      const r = restored as { content: string; version: number }

      // 2. 写入本地文件
      writeLocalCarapace(r.content)

      // 3. 推送快照到服务器（记录恢复操作）
      const pushed = await client.pushCarapaceSnapshot(r.content, 'restore')
      success(`已从服务器版本 ${r.version} 恢复本地 carapace.md（新快照版本 ${pushed.version}）`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error(`回滚失败: ${message}`)
    }
  })
