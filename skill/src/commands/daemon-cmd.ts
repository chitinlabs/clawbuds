import { Command } from 'commander'
import { loadState } from '../config.js'
import { info, error } from '../output.js'

export const daemonCommand = new Command('daemon')
  .description('Daemon management')

daemonCommand
  .command('status')
  .description('Check daemon status')
  .action(() => {
    const state = loadState()
    if (!state.daemonPid) {
      info('Daemon is not running (no PID recorded).')
      return
    }

    try {
      process.kill(state.daemonPid, 0)
      info(`Daemon is running (PID: ${state.daemonPid})`)
    } catch {
      error(`Daemon is not running (stale PID: ${state.daemonPid})`)
    }
  })
