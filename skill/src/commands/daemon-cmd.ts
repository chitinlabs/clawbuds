import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadState, saveState, listProfiles, getConfigDir } from '../config.js'
import { info, error, success } from '../output.js'

export const daemonCommand = new Command('daemon').description('Daemon management')

daemonCommand
  .command('start')
  .description('Start daemon in background')
  .action(() => {
    // Check if already running
    const state = loadState()
    if (state._daemonPid) {
      try {
        process.kill(state._daemonPid, 0)
        info(`Daemon already running (PID: ${state._daemonPid})`)
        return
      } catch {
        // Stale PID — continue to start
      }
    }

    // Read OpenClaw hooks token from ~/.openclaw/openclaw.json
    const openclawConfig = join(homedir(), '.openclaw', 'openclaw.json')
    let hooksToken = process.env.OPENCLAW_HOOKS_TOKEN || ''
    if (!hooksToken && existsSync(openclawConfig)) {
      try {
        const cfg = JSON.parse(readFileSync(openclawConfig, 'utf-8')) as Record<string, unknown>
        const hooks = cfg?.hooks as Record<string, unknown> | undefined
        if (typeof hooks?.token === 'string') hooksToken = hooks.token
      } catch {}
    }

    const configDir = getConfigDir()
    const logPath = join(configDir, 'daemon.log')
    const logFd = openSync(logPath, 'a')

    const child = spawn('clawbuds-daemon', [], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, OPENCLAW_HOOKS_TOKEN: hooksToken },
    })
    child.unref()

    const pid = child.pid!
    saveState({ ...state, _daemonPid: pid })
    success(`Daemon started (PID: ${pid}, log: ${logPath})`)
  })

daemonCommand
  .command('stop')
  .description('Stop daemon')
  .action(() => {
    const state = loadState()
    const pid = state._daemonPid

    if (!pid) {
      info('Daemon is not running')
      return
    }

    try {
      process.kill(pid, 'SIGTERM')
      saveState({ ...state, _daemonPid: undefined })
      success(`Daemon stopped (PID: ${pid})`)
    } catch {
      error(`Failed to stop daemon — process ${pid} not found`)
      saveState({ ...state, _daemonPid: undefined })
    }
  })

daemonCommand
  .command('status')
  .description('Check daemon status')
  .action(() => {
    const state = loadState()
    const pid = state._daemonPid

    if (!pid) {
      info('Daemon is not running (no PID recorded).')
      return
    }

    try {
      process.kill(pid, 0)
      const profiles = listProfiles()
      info(`Daemon is running (PID: ${pid})`)
      info(`Managing ${profiles.length} profile(s):`)
      profiles.forEach(({ name, profile, isDefault }) => {
        const marker = isDefault ? '*' : ' '
        info(`  ${marker} ${name} (${profile.serverUrl})`)
      })
    } catch {
      error(`Daemon is not running (stale PID: ${pid})`)
    }
  })
