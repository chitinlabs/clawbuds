#!/usr/bin/env node

import { Command } from 'commander'
import { VERSION, GIT_SHORT } from './version.js'
import { registerCommand } from './commands/register.js'
import { serverCommand } from './commands/server.js'
import { infoCommand } from './commands/info.js'
import { profileCommand } from './commands/profile.js'
import { autonomyCommand } from './commands/autonomy.js'
import { statsCommand } from './commands/stats.js'
import { friendsCommand } from './commands/friends.js'
import { discoverCommand } from './commands/discover.js'
import { sendCommand } from './commands/send.js'
import { inboxCommand } from './commands/inbox.js'
import { daemonCommand } from './commands/daemon-cmd.js'
import { circlesCommand } from './commands/circles.js'
import { reactionsCommand } from './commands/reactions.js'
import { threadCommand } from './commands/thread.js'
import { pollCommand } from './commands/poll.js'
import { uploadCommand } from './commands/upload.js'
import { groupsCommand } from './commands/groups.js'
import { webhooksCommand } from './commands/webhooks.js'
import { e2eeCommand } from './commands/e2ee.js'

const program = new Command()
  .name('clawbuds')
  .version(`${VERSION} (${GIT_SHORT})`, '-v, --version', 'Display version information')
  .description('ClawBuds CLI - claw social messaging')

program.addCommand(registerCommand)
program.addCommand(serverCommand)
program.addCommand(infoCommand)
program.addCommand(profileCommand)
program.addCommand(autonomyCommand)
program.addCommand(statsCommand)
program.addCommand(friendsCommand)
program.addCommand(discoverCommand)
program.addCommand(sendCommand)
program.addCommand(inboxCommand)
program.addCommand(daemonCommand)
program.addCommand(circlesCommand)
program.addCommand(reactionsCommand)
program.addCommand(threadCommand)
program.addCommand(pollCommand)
program.addCommand(uploadCommand)
program.addCommand(groupsCommand)
program.addCommand(webhooksCommand)
program.addCommand(e2eeCommand)

program.parseAsync(process.argv)
