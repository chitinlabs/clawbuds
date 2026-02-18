/**
 * 架构合规性测试
 *
 * 这些测试确保服务层和路由层不会绕过 Repository 抽象层直接访问数据库。
 *
 * 背景: 在引入 Repository 抽象层后，发现 GroupService 和 profile.ts
 * 仍然直接使用 db.prepare() 访问 SQLite。这些问题在 E2E/集成测试中
 * 未被检出，因为测试只覆盖了 SQLite 场景，功能表现正常。
 * 只有当尝试切换到 Supabase 时，这些绕过才会暴露。
 *
 * 根本原因分析:
 * 1. 测试只验证"功能是否工作"，不验证"实现是否正确"
 * 2. E2E 和集成测试只使用 SQLite 后端，无法检测抽象层被绕过
 * 3. 没有针对架构约束的静态分析测试
 * 4. 缺少 Supabase 后端的端到端测试
 *
 * 这些测试通过静态代码分析来防止类似的回归。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_DIR = join(__dirname, '..', '..', 'src')

/**
 * 递归获取目录下所有 .ts 文件
 */
function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...getTypeScriptFiles(fullPath))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * 读取文件内容，去除注释
 */
function readSourceCode(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  // 去除单行注释和多行注释
  return content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('Architecture Compliance: Repository Abstraction Layer', () => {
  const servicesDir = join(SRC_DIR, 'services')
  const routesDir = join(SRC_DIR, 'routes')
  const middlewareDir = join(SRC_DIR, 'middleware')

  // 收集需要检查的文件
  const serviceFiles = getTypeScriptFiles(servicesDir)
  const routeFiles = getTypeScriptFiles(routesDir)
  const middlewareFiles = getTypeScriptFiles(middlewareDir)

  const allFiles = [...serviceFiles, ...routeFiles, ...middlewareFiles]

  describe('Services, routes, and middleware must not use direct SQLite access', () => {
    it.each(allFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not contain db.prepare() calls',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        // 匹配 db.prepare( 或 this.db.prepare(
        const matches = source.match(/(?:this\.)?db\.prepare\s*\(/g)
        expect(matches).toBeNull()
      },
    )

    it.each(allFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not import better-sqlite3 directly',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        // 允许 type-only imports (import type)，禁止值导入
        const valueImports = source.match(/^import\s+(?!type\b).*from\s+['"]better-sqlite3['"]/gm)
        expect(valueImports).toBeNull()
      },
    )

    it.each(allFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not call getDatabase()',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        const matches = source.match(/\.getDatabase\s*\(\s*\)/g)
        expect(matches).toBeNull()
      },
    )
  })

  describe('IGroupDataAccess interface must not expose database-specific types', () => {
    it('should not import better-sqlite3', () => {
      const interfacePath = join(SRC_DIR, 'db', 'repositories', 'interfaces', 'group-data-access.interface.ts')
      const source = readSourceCode(interfacePath)
      const sqliteImport = source.match(/from\s+['"]better-sqlite3['"]/g)
      expect(sqliteImport).toBeNull()
    })

    it('should not have getDatabase() method', () => {
      const interfacePath = join(SRC_DIR, 'db', 'repositories', 'interfaces', 'group-data-access.interface.ts')
      const source = readSourceCode(interfacePath)
      const getDbMethod = source.match(/getDatabase\s*\(/g)
      expect(getDbMethod).toBeNull()
    })
  })

  describe('Repository interfaces must not expose database-specific types', () => {
    const interfacesDir = join(SRC_DIR, 'db', 'repositories', 'interfaces')
    const interfaceFiles = getTypeScriptFiles(interfacesDir)

    it.each(interfaceFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not value-import better-sqlite3',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        const valueImports = source.match(/^import\s+(?!type\b).*from\s+['"]better-sqlite3['"]/gm)
        expect(valueImports).toBeNull()
      },
    )

    it.each(interfaceFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not value-import @supabase/supabase-js',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        const valueImports = source.match(/^import\s+(?!type\b).*from\s+['"]@supabase\/supabase-js['"]/gm)
        expect(valueImports).toBeNull()
      },
    )
  })

  describe('All services must use dependency injection (not direct DB instantiation)', () => {
    it.each(serviceFiles.map((f) => [relative(SRC_DIR, f), f]))(
      '%s should not instantiate database connections',
      (_relativePath, filePath) => {
        const source = readSourceCode(filePath)
        // 禁止在服务中创建数据库连接
        const dbCreation = source.match(/new\s+(?:Database|BetterSqlite3)\s*\(/g)
        expect(dbCreation).toBeNull()
        // 禁止 createClient (Supabase)
        const supabaseCreation = source.match(/createClient\s*\(/g)
        expect(supabaseCreation).toBeNull()
      },
    )
  })
})
