/**
 * Mock Supabase Client for unit testing Supabase repositories.
 *
 * Creates a chainable mock that mimics the @supabase/supabase-js fluent API.
 * Each query builder records method calls and returns the configured result
 * at the terminal operation (.single(), await, .throwOnError()).
 */
import { vi } from 'vitest'

export interface MockQueryResult {
  data?: any
  error?: any
  count?: number | null
}

/**
 * Builds a chainable query builder that resolves to the given result.
 * Supports: select, insert, update, delete, upsert, eq, neq, in, or,
 * contains, order, range, limit, single, throwOnError, maybeSingle
 */
export function createQueryBuilder(result: MockQueryResult = { data: null, error: null }) {
  const builder: any = {}

  // All chainable methods return the builder itself
  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'or', 'and', 'not', 'is', 'contains', 'containedBy',
    'order', 'range', 'limit', 'offset',
    'throwOnError',
  ]

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }

  // single() and maybeSingle() return a thenable that also supports .throwOnError()
  // This mimics Supabase's PromiseLike builder pattern
  function createTerminalThenable() {
    const thenable: any = {
      throwOnError: vi.fn().mockReturnValue({
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      }),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    }
    return thenable
  }

  builder.single = vi.fn().mockReturnValue(createTerminalThenable())
  builder.maybeSingle = vi.fn().mockReturnValue(createTerminalThenable())

  // Make the builder itself thenable (for queries without .single())
  builder.then = (resolve: any, reject: any) => {
    return Promise.resolve(result).then(resolve, reject)
  }

  return builder
}

/**
 * Creates a mock SupabaseClient with a configurable `from()` method.
 *
 * Usage:
 *   const { client, mockFrom } = createMockSupabaseClient()
 *
 *   // Configure a query result
 *   mockFrom('claws', { data: { claw_id: 'abc' }, error: null })
 *
 *   // Use the client
 *   const repo = new SupabaseClawRepository(client)
 *   const claw = await repo.findById('abc')
 */
export function createMockSupabaseClient() {
  const tableResults = new Map<string, MockQueryResult>()
  const tableBuilders = new Map<string, any>()

  const client: any = {
    from: vi.fn((tableName: string) => {
      // If a pre-configured builder exists for this table, return it
      if (tableBuilders.has(tableName)) {
        return tableBuilders.get(tableName)
      }
      // Otherwise, create one with the configured result (or default)
      const result = tableResults.get(tableName) ?? { data: null, error: null }
      return createQueryBuilder(result)
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
        download: vi.fn().mockResolvedValue({ data: Buffer.from('test'), error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test' } }),
      }),
      getBucket: vi.fn().mockResolvedValue({ data: { name: 'test' }, error: null }),
      createBucket: vi.fn().mockResolvedValue({ error: null }),
    },
  }

  /**
   * Configure the result for a specific table.
   * Can pass a MockQueryResult or a pre-built query builder.
   */
  function mockFrom(tableName: string, resultOrBuilder: MockQueryResult | ReturnType<typeof createQueryBuilder>) {
    if ('then' in resultOrBuilder || 'single' in resultOrBuilder) {
      // It's a query builder
      tableBuilders.set(tableName, resultOrBuilder)
    } else {
      tableResults.set(tableName, resultOrBuilder as MockQueryResult)
      // Also update any existing builder
      tableBuilders.delete(tableName)
    }
  }

  /**
   * Configure a table with a specific query builder (for fine-grained control).
   */
  function mockTable(tableName: string, builder: any) {
    tableBuilders.set(tableName, builder)
  }

  return { client, mockFrom, mockTable, createQueryBuilder }
}

/**
 * Create a query builder that simulates a successful query.
 */
export function successBuilder(data: any, count?: number) {
  return createQueryBuilder({ data, error: null, count: count ?? null })
}

/**
 * Create a query builder that simulates a PGRST116 (not found) error.
 */
export function notFoundBuilder() {
  return createQueryBuilder({
    data: null,
    error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
  })
}

/**
 * Create a query builder that simulates a generic error.
 */
export function errorBuilder(message: string, code?: string) {
  return createQueryBuilder({
    data: null,
    error: { code: code ?? 'UNKNOWN', message },
  })
}
