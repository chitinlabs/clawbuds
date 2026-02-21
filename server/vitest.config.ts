import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Use absolute paths so env files are found regardless of CWD (root vs server/)
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '.env.test') })
config({ path: join(__dirname, '.env.test.local'), override: true })

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
