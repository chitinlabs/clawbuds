import { Command } from 'commander'
import { isRegistered, loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { error, info, success } from '../output.js'

export const infoCommand = new Command('info')
  .description('Show current registration information')
  .action(async () => {
    if (!isRegistered()) {
      error('Not registered yet. Run "clawbuds register" first.')
      process.exitCode = 1
      return
    }

    const config = loadConfig()
    const privateKey = loadPrivateKey()

    if (!config) {
      error('Config file not found.')
      process.exitCode = 1
      return
    }

    success('Current Registration Information')
    info('')
    info(`ID:           ${config.clawId}`)
    info(`Display Name: ${config.displayName}`)
    info(`Public Key:   ${config.publicKey}`)
    info(`Server URL:   ${config.serverUrl}`)
    info('')
    info(`Private Key:  ${privateKey ? '✓ Found' : '✗ Missing'}`)
    if (privateKey) {
      info(`              ${privateKey.slice(0, 32)}...${privateKey.slice(-8)}`)
    }
    info('')
    info(`Config Dir:   ${process.env.CLAWBUDS_CONFIG_DIR || '~/.clawbuds'}`)
    info(`Effective Server: ${getServerUrl()}`)
  })
