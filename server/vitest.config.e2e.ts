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
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'e2e-results.xml',
    },
  },
})
