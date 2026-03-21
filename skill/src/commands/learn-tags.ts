import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'
import { ensureConfigDir } from '../config.js'

function getTagsPath(configDir: string, profileName: string): string {
  return join(configDir, `learned-tags-${profileName}.json`)
}

interface LearnedTags {
  tags: string[]
  lastSyncedAt: string | null
  updatedAt: string
}

function loadTags(configDir: string, profileName: string): LearnedTags {
  const path = getTagsPath(configDir, profileName)
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { tags: [], lastSyncedAt: null, updatedAt: new Date().toISOString() }
}

function saveTags(configDir: string, profileName: string, data: LearnedTags): void {
  const path = getTagsPath(configDir, profileName)
  writeFileSync(path, JSON.stringify(data, null, 2))
}

export const learnTagsCommand = new Command('learn-tags')
  .description('Manage automatically learned interest tags')
  .option('--add <tags>', 'Add comma-separated tags')
  .option('--remove <tags>', 'Remove comma-separated tags')
  .option('--show', 'Show current learned tags')
  .option('--sync', 'Sync learned tags to server profile')

addProfileOption(learnTagsCommand)

learnTagsCommand.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const configDir = ensureConfigDir()
  const data = loadTags(configDir, ctx.profileName)

  if (opts.add) {
    const newTags = (opts.add as string)
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)

    const existing = new Set(data.tags)
    let added = 0
    for (const tag of newTags) {
      if (!existing.has(tag)) {
        data.tags.push(tag)
        existing.add(tag)
        added++
      }
    }

    // Cap at 30 tags
    if (data.tags.length > 30) {
      data.tags = data.tags.slice(-30)
    }

    data.updatedAt = new Date().toISOString()
    saveTags(configDir, ctx.profileName, data)

    if (added > 0) {
      success(`Added ${added} tag(s). Total: ${data.tags.length}`)
    } else {
      info('No new tags added (all already exist).')
    }
    return
  }

  if (opts.remove) {
    const removeTags = new Set(
      (opts.remove as string)
        .split(',')
        .map((t: string) => t.trim().toLowerCase())
        .filter(Boolean),
    )

    const before = data.tags.length
    data.tags = data.tags.filter((t) => !removeTags.has(t))
    const removed = before - data.tags.length

    data.updatedAt = new Date().toISOString()
    saveTags(configDir, ctx.profileName, data)

    success(`Removed ${removed} tag(s). Total: ${data.tags.length}`)
    return
  }

  if (opts.sync) {
    if (data.tags.length === 0) {
      info('No learned tags to sync.')
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.updateProfile({ tags: data.tags })
      data.lastSyncedAt = new Date().toISOString()
      saveTags(configDir, ctx.profileName, data)
      success(`Synced ${data.tags.length} tags to server profile.`)
    } catch (err) {
      error(`Sync failed: ${(err as Error).message}`)
    }
    return
  }

  // Default: --show
  if (data.tags.length === 0) {
    info('No learned tags yet. Tags are automatically collected during conversations (§2.7).')
    return
  }

  console.log(`Learned tags (${data.tags.length}):`)
  console.log(`  ${data.tags.join(', ')}`)
  console.log()
  console.log(`Last updated: ${data.updatedAt}`)
  console.log(`Last synced:  ${data.lastSyncedAt ?? 'never'}`)
})
