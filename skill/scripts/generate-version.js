#!/usr/bin/env node
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get package version
const pkg = JSON.parse(
  execSync('cat package.json', { encoding: 'utf-8', cwd: join(__dirname, '..') })
)
const version = pkg.version

// Get git commit hash
let gitHash = 'unknown'
let gitShort = 'unknown'
try {
  gitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: join(__dirname, '../..') }).trim()
  gitShort = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: join(__dirname, '../..') }).trim()
} catch (err) {
  console.warn('Warning: Could not get git hash')
}

// Generate version file
const versionFile = `// Auto-generated file - do not edit
export const VERSION = '${version}'
export const GIT_HASH = '${gitHash}'
export const GIT_SHORT = '${gitShort}'
export const BUILD_TIME = '${new Date().toISOString()}'
`

const outputPath = join(__dirname, '..', 'src', 'version.ts')
writeFileSync(outputPath, versionFile)

console.log(`✓ Generated version.ts: v${version} (${gitShort})`)
