/**
 * CarapaceEditor — carapace.md 自动编辑器（Phase 10）
 * 每次写入前自动备份，只追加规则，不修改或删除现有内容
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type {
  ICarapaceHistoryRepository,
  CarapaceChangeReason,
} from '../db/repositories/interfaces/carapace-history.repository.interface.js'
import type { MicroMoltSuggestion } from './micro-molt.service.js'

/** 移除换行符，防止换行注入攻击 */
function sanitizeLine(input: string): string {
  return input.replace(/[\r\n]/g, ' ').trim()
}

export class CarapaceEditor {
  private readonly resolvedPath: string

  constructor(
    private historyRepo: ICarapaceHistoryRepository,
    carapaceFilePath: string,
  ) {
    // CRITICAL-3: 路径安全校验，防止路径遍历攻击
    const allowedBase = resolve(process.env['CLAWBUDS_DATA_DIR'] ?? homedir())
    const resolved = resolve(carapaceFilePath)
    if (!resolved.startsWith(allowedBase + '/') && resolved !== allowedBase) {
      throw new Error(
        `carapace file path must be under ${allowedBase}, got ${resolved}`,
      )
    }
    this.resolvedPath = resolved
  }

  /**
   * 在 carapace.md 中添加授权规则（allow 命令的底层实现）
   * 原则：只追加，不修改或删除现有规则
   */
  async allow(clawId: string, friendId: string, scope: string, note?: string): Promise<void> {
    await this.backupCurrentVersion(clawId, 'allow', 'user')

    const current = await this.readCarapace()
    const date = new Date().toISOString().slice(0, 10)
    const safeFriendId = sanitizeLine(friendId)
    const safeScope = sanitizeLine(scope)
    const safeNote = note ? sanitizeLine(note) : undefined
    const annotation = safeNote
      ? `<!-- Micro-Molt: ${date}, ${safeNote} -->`
      : `<!-- Micro-Molt: ${date}, allow 规则 -->`
    const rule = `> 对 ${safeFriendId}，${safeScope}可以直接发送，无需审阅`

    await this.writeCarapace(`${current.trimEnd()}\n\n${annotation}\n${rule}\n`)
  }

  /**
   * 在 carapace.md 中添加升级规则（escalate = 从自动升级到要求人工审阅）
   */
  async escalate(clawId: string, condition: string, action: string): Promise<void> {
    await this.backupCurrentVersion(clawId, 'escalate', 'user')

    const current = await this.readCarapace()
    const date = new Date().toISOString().slice(0, 10)
    const safeCondition = sanitizeLine(condition)
    const safeAction = sanitizeLine(action)
    const annotation = `<!-- Micro-Molt: ${date}, escalate 规则 -->`
    const rule = `> 当 ${safeCondition} 时，${safeAction}`

    await this.writeCarapace(`${current.trimEnd()}\n\n${annotation}\n${rule}\n`)
  }

  /**
   * 应用完整的 Micro-Molt 建议（任意类型）
   */
  async applyMicroMolt(clawId: string, suggestion: MicroMoltSuggestion): Promise<void> {
    await this.backupCurrentVersion(clawId, 'micro_molt', 'system')

    const current = await this.readCarapace()
    const date = new Date().toISOString().slice(0, 10)
    const annotation = `<!-- Micro-Molt: ${date}, ${suggestion.description} -->`

    let rule: string
    switch (suggestion.type) {
      case 'allow':
        rule = `> 对 ${suggestion.friendId ?? 'unknown'}，${suggestion.scope ?? suggestion.description}可以直接发送，无需审阅`
        break
      case 'escalate':
        rule = `> 当 ${suggestion.condition ?? suggestion.description} 时，${suggestion.action ?? '需要人工审阅'}`
        break
      default:
        rule = `> ${suggestion.description}（通过 ${suggestion.cliCommand}）`
    }

    await this.writeCarapace(`${current.trimEnd()}\n\n${annotation}\n${rule}\n`)
  }

  /**
   * 获取当前 carapace.md 内容（只读，不备份）
   */
  async getContent(): Promise<string> {
    return this.readCarapace()
  }

  /**
   * 回滚到指定版本（当前版本自动备份后再回滚）
   */
  async restoreVersion(clawId: string, version: number): Promise<void> {
    const target = await this.historyRepo.findByVersion(clawId, version)
    if (!target) {
      throw new Error(`carapace.md 版本 ${version} 不存在`)
    }

    await this.backupCurrentVersion(clawId, 'restore', 'user')
    await this.writeCarapace(target.content)
  }

  /**
   * 备份当前版本（每次写入前自动调用）
   * @returns 新版本记录的 ID
   */
  private async backupCurrentVersion(
    clawId: string,
    reason: CarapaceChangeReason,
    suggestedBy: 'system' | 'user',
  ): Promise<string> {
    const content = await this.readCarapace()
    const id = randomUUID()
    const record = await this.historyRepo.create({
      id,
      clawId,
      content,
      changeReason: reason,
      suggestedBy,
    })
    return record.id
  }

  /**
   * 读取当前 carapace.md（文件不存在时返回空字符串）
   */
  private async readCarapace(): Promise<string> {
    try {
      return await readFile(this.resolvedPath, 'utf-8')
    } catch {
      return ''
    }
  }

  /**
   * 写入 carapace.md
   */
  private async writeCarapace(content: string): Promise<void> {
    await writeFile(this.resolvedPath, content, 'utf-8')
  }
}
