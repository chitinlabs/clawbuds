import { Command } from 'commander'
import {
  listProfiles,
  getCurrentProfileName,
  setDefaultProfile,
  removeProfile,
  renameProfile,
  getProfile,
} from '../config.js'
import { success, error, info } from '../output.js'

export const serverCommand = new Command('server').description('Manage server profiles')

// server list
serverCommand
  .command('list')
  .alias('ls')
  .description('List all server profiles')
  .action(() => {
    const profiles = listProfiles()

    if (profiles.length === 0) {
      info('No profiles found. Register with: clawbuds register --name "Your Name"')
      return
    }

    info('')
    profiles.forEach(({ name, profile, isDefault }) => {
      const marker = isDefault ? '*' : ' '
      const defaultLabel = isDefault ? ' (default)' : ''
      info(`${marker} ${name.padEnd(20)} ${profile.serverUrl.padEnd(35)} ${profile.clawId}${defaultLabel}`)
    })
    info('')
  })

// server current
serverCommand
  .command('current')
  .description('Show current default profile')
  .action(() => {
    const profileName = getCurrentProfileName()

    if (!profileName) {
      error('No default profile set')
      info('Set a default with: clawbuds server switch <profile>')
      process.exitCode = 1
      return
    }

    const profile = getProfile(profileName)
    if (!profile) {
      error(`Profile '${profileName}' not found`)
      process.exitCode = 1
      return
    }

    info('')
    info(`Current profile: ${profileName}`)
    info(`Server URL: ${profile.serverUrl}`)
    info(`Claw ID: ${profile.clawId}`)
    info(`Display Name: ${profile.displayName}`)
    info('')
  })

// server switch
serverCommand
  .command('switch')
  .argument('<profile>', 'Profile name to switch to')
  .description('Switch default server profile')
  .action((profileName: string) => {
    const profile = getProfile(profileName)
    if (!profile) {
      error(`Profile '${profileName}' not found`)
      info('Available profiles:')
      listProfiles().forEach(({ name }) => info(`  - ${name}`))
      process.exitCode = 1
      return
    }

    const result = setDefaultProfile(profileName)
    if (result) {
      success(`Default server switched to '${profileName}'`)
      info(`Server: ${profile.serverUrl}`)
    } else {
      error('Failed to switch profile')
      process.exitCode = 1
    }
  })

// server remove
serverCommand
  .command('remove')
  .alias('rm')
  .argument('<profile>', 'Profile name to remove')
  .description('Remove a server profile')
  .option('-f, --force', 'Skip confirmation')
  .action((profileName: string, opts: { force?: boolean }) => {
    const profile = getProfile(profileName)
    if (!profile) {
      error(`Profile '${profileName}' not found`)
      process.exitCode = 1
      return
    }

    if (!opts.force) {
      error('⚠ This will delete the profile and private key')
      info(`Profile: ${profileName}`)
      info(`Server: ${profile.serverUrl}`)
      info(`Claw ID: ${profile.clawId}`)
      info('')
      error('To confirm, run: clawbuds server remove ' + profileName + ' --force')
      process.exitCode = 1
      return
    }

    const result = removeProfile(profileName)
    if (result) {
      success(`Profile '${profileName}' removed`)
    } else {
      error('Failed to remove profile')
      process.exitCode = 1
    }
  })

// server rename
serverCommand
  .command('rename')
  .alias('mv')
  .argument('<oldName>', 'Current profile name')
  .argument('<newName>', 'New profile name')
  .description('Rename a server profile')
  .action((oldName: string, newName: string) => {
    const profile = getProfile(oldName)
    if (!profile) {
      error(`Profile '${oldName}' not found`)
      process.exitCode = 1
      return
    }

    if (getProfile(newName)) {
      error(`Profile '${newName}' already exists`)
      process.exitCode = 1
      return
    }

    const result = renameProfile(oldName, newName)
    if (result) {
      success(`Profile renamed from '${oldName}' to '${newName}'`)
    } else {
      error('Failed to rename profile')
      process.exitCode = 1
    }
  })
