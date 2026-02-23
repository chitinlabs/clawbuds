/**
 * carapace-init.ts — carapace.md 默认模板初始化（Phase 11 T1）
 * 首次注册时，将 references/carapace.{lang}.md 模板复制到用户配置目录。
 * 语言优先级：系统 LANG → LC_ALL → LC_MESSAGES → 默认英文
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Detect locale from environment variables, returns 'zh' or 'en' */
function detectLanguage(): 'zh' | 'en' {
  const lang = (
    process.env.LANG ??
    process.env.LC_ALL ??
    process.env.LC_MESSAGES ??
    process.env.LANGUAGE ??
    ''
  ).toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

/**
 * 将 carapace.md 默认模板初始化到用户配置目录（幂等：已存在则不覆盖）
 * @param configDir - 用户配置目录（~/.clawbuds 或 CLAWBUDS_CONFIG_DIR）
 */
export function initializeCarapaceTemplate(configDir: string): void {
  const referencesDir = join(configDir, 'references')
  const targetPath = join(referencesDir, 'carapace.md')

  // Already exists — don't overwrite user customizations
  if (existsSync(targetPath)) return

  mkdirSync(referencesDir, { recursive: true })

  const lang = detectLanguage()
  const referencesDir_ = join(__dirname, '..', 'references')

  // Try language-specific template first, fall back to English
  const candidates = [
    join(referencesDir_, `carapace.${lang}.md`),
    join(referencesDir_, 'carapace.en.md'),
    join(referencesDir_, 'carapace.md'),  // legacy fallback
  ]

  const templatePath = candidates.find(existsSync)
  if (!templatePath) return  // no template found — skip silently

  writeFileSync(targetPath, readFileSync(templatePath, 'utf-8'), 'utf-8')
}
