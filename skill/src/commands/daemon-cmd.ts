import { Command } from 'commander'
import { loadState, listProfiles } from '../config.js'
import { info, error } from '../output.js'

export const daemonCommand = new Command('daemon').description('Daemon management')

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
