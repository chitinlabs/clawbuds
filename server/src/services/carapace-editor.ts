/**
 * CarapaceEditor — carapace.md 自动编辑器（Phase 10）
 * 每次写入前自动备份，只追加规则，不修改或删除现有内容
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  ICarapaceHistoryRepository,
  CarapaceChangeReason,
} from '../db/repositories/interfaces/carapace-history.repository.interface.js'
import type { MicroMoltSuggestion } from './micro-molt.service.js'

export class CarapaceEditor {
  constructor(
    private historyRepo: ICarapaceHistoryRepository,
    private carapaceFilePath: string,
    private clawId: string,
  ) {}

  /**
   * 在 carapace.md 中添加授权规则（allow 命令的底层实现）
   * 原则：只追加，不修改或删除现有规则
   */
  async allow(friendId: string, scope: string, note?: string): Promise<void> {
    await this.backupCurrentVersion('allow', 'user')

    const current = this.readCarapace()
    const date = new Date().toISOString().slice(0, 10)
    const annotation = note
      ? `<!-- Micro-Molt: ${date}, ${note} -->`
      : `<!-- Micro-Molt: ${date}, allow 规则 -->`
    const rule = `> 对 ${friendId}，${scope}可以直接发送，无需审阅`

    const newContent = `${current.trimEnd()}\n\n${annotation}\n${rule}\n`
    this.writeCarapace(newContent)
  }

  /**
   * 在 carapace.md 中添加升级规则（escalate = 从自动升级到要求人工审阅）
   */
  async escalate(condition: string, action: string): Promise<void> {
    await this.backupCurrentVersion('escalate', 'user')

    const current = this.readCarapace()
    const date = new Date().toISOString().slice(0, 10)
    const annotation = `<!-- Micro-Molt: ${date}, escalate 规则 -->`
    const rule = `> 当 ${condition} 时，${action}`

    const newContent = `${current.trimEnd()}\n\n${annotation}\n${rule}\n`
    this.writeCarapace(newContent)
  }

  /**
   * 应用完整的 Micro-Molt 建议（任意类型）
   */
  async applyMicroMolt(suggestion: MicroMoltSuggestion): Promise<void> {
    await this.backupCurrentVersion('micro_molt', 'system')

    const current = this.readCarapace()
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

    const newContent = `${current.trimEnd()}\n\n${annotation}\n${rule}\n`
    this.writeCarapace(newContent)
  }

  /**
   * 回滚到指定版本（当前版本自动备份后再回滚）
   */
  async restoreVersion(version: number): Promise<void> {
    const target = await this.historyRepo.findByVersion(this.clawId, version)
    if (!target) {
      throw new Error(`carapace.md 版本 ${version} 不存在`)
    }

    await this.backupCurrentVersion('restore', 'user')
    this.writeCarapace(target.content)
  }

  /**
   * 备份当前版本（每次写入前自动调用）
   * @returns 新版本记录的 ID
   */
  private async backupCurrentVersion(
    reason: CarapaceChangeReason,
    suggestedBy: 'system' | 'user',
  ): Promise<string> {
    const content = this.readCarapace()
    const id = randomUUID()
    const record = await this.historyRepo.create({
      id,
      clawId: this.clawId,
      content,
      changeReason: reason,
      suggestedBy,
    })
    return record.id
  }

  /**
   * 读取当前 carapace.md（文件不存在时返回空字符串）
   */
  private readCarapace(): string {
    if (!existsSync(this.carapaceFilePath)) return ''
    return readFileSync(this.carapaceFilePath, 'utf-8')
  }

  /**
   * 写入 carapace.md
   */
  private writeCarapace(content: string): void {
    writeFileSync(this.carapaceFilePath, content, 'utf-8')
  }
}
