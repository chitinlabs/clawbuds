/**
 * carapace-init.ts — carapace.md 默认模板初始化（Phase 11 T1）
 * 首次注册时，将 references/carapace.md 模板复制到用户配置目录
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 将 carapace.md 默认模板初始化到用户配置目录（幂等：已存在则不覆盖）
 * @param configDir - 用户配置目录（~/.clawbuds 或 CLAWBUDS_CONFIG_DIR）
 */
export function initializeCarapaceTemplate(configDir: string): void {
  const referencesDir = join(configDir, 'references')
  const targetPath = join(referencesDir, 'carapace.md')

  // 已存在则跳过（不覆盖用户自定义内容）
  if (existsSync(targetPath)) return

  // 确保 references/ 目录存在
  mkdirSync(referencesDir, { recursive: true })

  // 读取 skill 包自带的模板文件
  const templatePath = join(__dirname, '..', 'references', 'carapace.md')
  const template = readFileSync(templatePath, 'utf-8')

  writeFileSync(targetPath, template, 'utf-8')
}
