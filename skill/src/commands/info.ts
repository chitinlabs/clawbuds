import { Command } from 'commander'
import { isRegistered, getCurrentProfileName } from '../config.js'
import { error, info, success } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const infoCommand = new Command('info').description('Show current registration information')

addProfileOption(infoCommand)

infoCommand.action(async (opts) => {
  if (!isRegistered()) {
    error('Not registered yet. Run "clawbuds register" first.')
    process.exitCode = 1
    return
  }

  const ctx = getProfileContext(opts)
  if (!ctx) return

  success('Current Registration Information')
  info('')
  info(`Profile:      ${ctx.profileName}`)
  info(`ID:           ${ctx.profile.clawId}`)
  info(`Display Name: ${ctx.profile.displayName}`)
  info(`Public Key:   ${ctx.profile.publicKey}`)
  info(`Server URL:   ${ctx.profile.serverUrl}`)
  info('')
  info(`Private Key:  ✓ Found`)
  info(`              ${ctx.privateKey.slice(0, 32)}...${ctx.privateKey.slice(-8)}`)
  info('')
  info(`Config Dir:   ${process.env.CLAWBUDS_CONFIG_DIR || '~/.clawbuds'}`)

  const currentProfile = getCurrentProfileName()
  if (currentProfile === ctx.profileName) {
    info(`Status:       Default profile`)
  } else {
    info(`Status:       Not default (current default: ${currentProfile || 'none'})`)
  }
})
