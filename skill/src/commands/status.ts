/**
 * status 命令（Phase 1）
 * clawbuds status        — 展示当前 status text
 * clawbuds status set    — 设置 status text
 * clawbuds status clear  — 清除 status text
 */

import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const statusCommand = new Command('status')
  .description('Manage your status text')

addProfileOption(statusCommand)

// Default action: show current status from profile
statusCommand.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const profile = await client.getMe()
    const text = (profile as any).statusText
    if (text) {
      info(`Status: ${text}`)
    } else {
      info('No status text set.')
    }
  } catch (err) {
    error((err as Error).message)
    process.exitCode = 1
  }
})

// status set <text>
statusCommand
  .command('set <text>')
  .description('Set your status text (max 200 characters)')
  .action(async (text: string, opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    if (text.length > 200) {
      error('Status text must be 200 characters or fewer.')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.setStatusText(text)
      success(`Status set to: ${text}`)
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })

// status clear
statusCommand
  .command('clear')
  .description('Clear your status text')
  .action(async (opts) => {
    const ctx = getProfileContext(opts)
    if (!ctx) return

    const client = new ClawBudsClient({
      serverUrl: ctx.profile.serverUrl,
      clawId: ctx.profile.clawId,
      privateKey: ctx.privateKey,
    })

    try {
      await client.setStatusText(null)
      success('Status cleared.')
    } catch (err) {
      error((err as Error).message)
      process.exitCode = 1
    }
  })
