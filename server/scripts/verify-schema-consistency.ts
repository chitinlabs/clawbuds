/**
 * Schema Consistency Verification Tool
 *
 * 验证SQLite和Supabase schema的一致性
 * 检测类型不匹配、缺失表、字段差异等问题
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface Column {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  unique: boolean
  defaultValue?: string
}

interface Table {
  name: string
  columns: Column[]
}

interface Schema {
  tables: Table[]
}

// ========== SQLite Schema解析 ==========

function parseSqliteSchema(): Schema {
  const migrationsDir = join(__dirname, '../src/db/migrations')
  const migrations = [
    '001_claws.sql',
    '002_friendships.sql',
    '003_messages.sql',
    '004_circles.sql',
    '005_extended.sql',
    '006_e2ee.sql',
    '007_webhooks.sql',
    '008_groups.sql',
    '009_discovery.sql',
  ]

  const tables: Table[] = []

  for (const migration of migrations) {
    const sql = readFileSync(join(migrationsDir, migration), 'utf-8')

    // 提取CREATE TABLE语句
    const tableMatches = sql.matchAll(/CREATE TABLE.*?(\w+)\s*\(([\s\S]*?)\);/gi)

    for (const match of tableMatches) {
      const tableName = match[1]
      const columnDefs = match[2]

      const columns = parseColumnDefinitions(columnDefs, 'sqlite')

      tables.push({
        name: tableName,
        columns,
      })
    }
  }

  return { tables }
}

// ========== Supabase Schema解析 ==========

function parseSupabaseSchema(): Schema {
  const schemaPath = join(__dirname, '../src/db/supabase-schema.sql')
  const sql = readFileSync(schemaPath, 'utf-8')

  const tables: Table[] = []

  // 提取CREATE TABLE语句
  const tableMatches = sql.matchAll(/CREATE TABLE.*?(\w+)\s*\(([\s\S]*?)\);/gi)

  for (const match of tableMatches) {
    const tableName = match[1]
    const columnDefs = match[2]

    const columns = parseColumnDefinitions(columnDefs, 'postgres')

    tables.push({
      name: tableName,
      columns,
    })
  }

  return { tables }
}

// ========== 字段定义解析 ==========

function parseColumnDefinitions(columnDefs: string, dialect: 'sqlite' | 'postgres'): Column[] {
  const columns: Column[] = []

  // 分割字段定义（按逗号，但要注意CHECK约束中的逗号）
  const lines = columnDefs.split('\n').map((l) => l.trim()).filter((l) => l)

  for (const line of lines) {
    // 跳过约束和索引
    if (
      line.startsWith('PRIMARY KEY') ||
      line.startsWith('FOREIGN KEY') ||
      line.startsWith('UNIQUE') ||
      line.startsWith('CHECK') ||
      line.startsWith('CONSTRAINT') ||
      line.startsWith('--')
    ) {
      continue
    }

    // 移除尾部逗号
    const cleanLine = line.replace(/,$/, '')

    // 提取字段名（第一个单词）
    const parts = cleanLine.split(/\s+/)
    if (parts.length < 2) continue

    const name = parts[0].replace(/"/g, '') // 移除引号
    const restOfLine = cleanLine.substring(name.length).trim()

    // 提取类型
    const typeMatch = restOfLine.match(/^(\w+(\(\d+\))?)/i)
    if (!typeMatch) continue

    const type = typeMatch[1]

    // 检查约束
    const nullable = !restOfLine.includes('NOT NULL')
    const primaryKey = restOfLine.includes('PRIMARY KEY')
    const unique = restOfLine.includes('UNIQUE')

    // 提取默认值
    let defaultValue: string | undefined
    const defaultMatch = restOfLine.match(/DEFAULT\s+([^,\s]+(?:\([^)]*\))?)/i)
    if (defaultMatch) {
      defaultValue = defaultMatch[1]
    }

    columns.push({
      name,
      type,
      nullable,
      primaryKey,
      unique,
      defaultValue,
    })
  }

  return columns
}

// ========== 类型标准化 ==========

function normalizeType(dbType: string, dialect: 'sqlite' | 'postgres'): string {
  // 移除括号中的长度限制
  const baseType = dbType.replace(/\(.*?\)/, '').toUpperCase()

  const typeMap: Record<string, string> = {
    // SQLite类型
    TEXT: 'text',
    INTEGER: 'integer',
    REAL: 'real',
    BLOB: 'blob',

    // PostgreSQL类型
    VARCHAR: 'text',
    CHAR: 'text',
    UUID: 'uuid', // ⚠️ 应该映射到text（claw_id用例）
    BIGINT: 'bigint',
    SMALLINT: 'integer',
    TIMESTAMPTZ: 'timestamp',
    TIMESTAMP: 'timestamp',
    JSONB: 'jsonb',
    JSON: 'jsonb',
    BOOLEAN: 'boolean',
    BOOL: 'boolean',
  }

  return typeMap[baseType] || baseType.toLowerCase()
}

// ========== Schema对比 ==========

interface Issue {
  severity: 'error' | 'warning' | 'info'
  category: string
  message: string
  table?: string
  column?: string
}

function compareSchemas(sqlite: Schema, supabase: Schema): Issue[] {
  const issues: Issue[] = []

  // 创建表名映射
  const sqliteTables = new Map(sqlite.tables.map((t) => [t.name, t]))
  const supabaseTables = new Map(supabase.tables.map((t) => [t.name, t]))

  // 检查缺失的表
  for (const tableName of sqliteTables.keys()) {
    if (!supabaseTables.has(tableName)) {
      issues.push({
        severity: 'error',
        category: 'missing_table',
        message: `Table '${tableName}' exists in SQLite but not in Supabase`,
        table: tableName,
      })
    }
  }

  for (const tableName of supabaseTables.keys()) {
    if (!sqliteTables.has(tableName)) {
      issues.push({
        severity: 'warning',
        category: 'extra_table',
        message: `Table '${tableName}' exists in Supabase but not in SQLite`,
        table: tableName,
      })
    }
  }

  // 对比共同表的字段
  for (const tableName of sqliteTables.keys()) {
    const sqliteTable = sqliteTables.get(tableName)!
    const supabaseTable = supabaseTables.get(tableName)

    if (!supabaseTable) continue

    const sqliteColumns = new Map(sqliteTable.columns.map((c) => [c.name, c]))
    const supabaseColumns = new Map(supabaseTable.columns.map((c) => [c.name, c]))

    // 检查缺失的字段
    for (const colName of sqliteColumns.keys()) {
      if (!supabaseColumns.has(colName)) {
        issues.push({
          severity: 'error',
          category: 'missing_column',
          message: `Column '${tableName}.${colName}' exists in SQLite but not in Supabase`,
          table: tableName,
          column: colName,
        })
      }
    }

    // 对比字段类型
    for (const colName of sqliteColumns.keys()) {
      const sqliteCol = sqliteColumns.get(colName)!
      const supabaseCol = supabaseColumns.get(colName)

      if (!supabaseCol) continue

      const sqliteType = normalizeType(sqliteCol.type, 'sqlite')
      const supabaseType = normalizeType(supabaseCol.type, 'postgres')

      // 类型不匹配检查
      if (sqliteType !== supabaseType) {
        // 特殊情况：claw_id应该是TEXT，不是UUID
        if (colName === 'claw_id' && supabaseType === 'uuid') {
          issues.push({
            severity: 'error',
            category: 'type_mismatch',
            message: `❌ CRITICAL: ${tableName}.${colName} type mismatch\n` +
                     `   SQLite:   ${sqliteCol.type} (${sqliteType})\n` +
                     `   Supabase: ${supabaseCol.type} (${supabaseType})\n` +
                     `   Expected: TEXT in both (for claw_xxx format)`,
            table: tableName,
            column: colName,
          })
        } else if (
          // 允许的类型映射
          (sqliteType === 'text' && supabaseType === 'text') ||
          (sqliteType === 'integer' && supabaseType === 'integer') ||
          (sqliteType === 'integer' && supabaseType === 'bigint') ||
          (sqliteType === 'timestamp' && supabaseType === 'timestamp')
        ) {
          // OK
        } else {
          issues.push({
            severity: 'warning',
            category: 'type_mismatch',
            message: `Type mismatch in ${tableName}.${colName}\n` +
                     `   SQLite:   ${sqliteCol.type} (${sqliteType})\n` +
                     `   Supabase: ${supabaseCol.type} (${supabaseType})`,
            table: tableName,
            column: colName,
          })
        }
      }

      // 主键检查
      if (sqliteCol.primaryKey !== supabaseCol.primaryKey) {
        issues.push({
          severity: 'error',
          category: 'constraint_mismatch',
          message: `Primary key mismatch in ${tableName}.${colName}\n` +
                   `   SQLite:   ${sqliteCol.primaryKey}\n` +
                   `   Supabase: ${supabaseCol.primaryKey}`,
          table: tableName,
          column: colName,
        })
      }
    }
  }

  return issues
}

// ========== 主程序 ==========

function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Schema Consistency Verification')
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('📖 Parsing SQLite schema...')
  const sqliteSchema = parseSqliteSchema()
  console.log(`   Found ${sqliteSchema.tables.length} tables\n`)

  console.log('📖 Parsing Supabase schema...')
  const supabaseSchema = parseSupabaseSchema()
  console.log(`   Found ${supabaseSchema.tables.length} tables\n`)

  console.log('🔍 Comparing schemas...\n')
  const issues = compareSchemas(sqliteSchema, supabaseSchema)

  // 按严重性分组
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const infos = issues.filter((i) => i.severity === 'info')

  // 输出结果
  if (errors.length > 0) {
    console.log('❌ ERRORS:\n')
    for (const issue of errors) {
      console.log(`  [${issue.category}] ${issue.message}\n`)
    }
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n')
    for (const issue of warnings) {
      console.log(`  [${issue.category}] ${issue.message}\n`)
    }
  }

  if (infos.length > 0) {
    console.log('ℹ️  INFO:\n')
    for (const issue of infos) {
      console.log(`  [${issue.category}] ${issue.message}\n`)
    }
  }

  // 总结
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Summary')
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`  Errors:   ${errors.length}`)
  console.log(`  Warnings: ${warnings.length}`)
  console.log(`  Info:     ${infos.length}\n`)

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Schema consistency check PASSED\n')
    process.exit(0)
  } else if (errors.length > 0) {
    console.log('❌ Schema consistency check FAILED\n')
    console.log('Please fix the errors above before proceeding.\n')
    process.exit(1)
  } else {
    console.log('⚠️  Schema consistency check passed with warnings\n')
    process.exit(0)
  }
}

main()
