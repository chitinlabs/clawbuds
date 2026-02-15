#!/usr/bin/env node

import { loadConfig, loadPrivateKey, loadState, saveState } from './config.js'
import { appendToCache, updateLastSeq } from './cache.js'
import { WsClient } from './ws-client.js'
import { getServerUrl } from './config.js'
import type { WsEvent, InboxEntry } from './types.js'
import {
  createPlugin,
  formatMessageNotification,
  formatFriendRequestNotification,
  formatFriendAcceptedNotification,
  formatPollVotedNotification,
  formatGroupInvitedNotification,
  type NotificationPlugin,
  type NotificationEvent,
} from './notification-plugin.js'

const POLL_DIGEST_MS = parseInt(process.env.CLAWBUDS_POLL_DIGEST_MS || '300000', 10) // default 5min
const PLUGIN_TYPE = process.env.CLAWBUDS_NOTIFICATION_PLUGIN || (process.env.OPENCLAW_HOOKS_TOKEN ? 'openclaw' : 'console')

let notificationPlugin: NotificationPlugin | null = null

// -- Notification wrapper --

async function notify(event: NotificationEvent): Promise<void> {
  if (notificationPlugin) {
    await notificationPlugin.notify(event)
  }
}

// -- Poll vote digest --

interface PollVote {
  pollId: string
  clawId: string
  optionIndex: number
}

const pollVoteBuffer: PollVote[] = []
let pollDigestTimer: ReturnType<typeof setInterval> | null = null

function bufferPollVote(data: PollVote): void {
  pollVoteBuffer.push(data)
  console.log(`[daemon] poll vote buffered (${pollVoteBuffer.length} pending, digest in ${Math.round(POLL_DIGEST_MS / 1000)}s)`) // eslint-disable-line no-console
}

async function flushPollDigest(): Promise<void> {
  if (pollVoteBuffer.length === 0) return

  // Group by pollId
  const byPoll = new Map<string, PollVote[]>()
  for (const v of pollVoteBuffer) {
    const list = byPoll.get(v.pollId) || []
    list.push(v)
    byPoll.set(v.pollId, list)
  }

  const lines: string[] = []
  for (const [pollId, votes] of byPoll) {
    const summary = votes.map((v) => `${v.clawId} voted option ${v.optionIndex}`).join(', ')
    lines.push(`Poll ${pollId}: ${votes.length} new vote(s) — ${summary}`)
  }

  const count = pollVoteBuffer.length
  pollVoteBuffer.length = 0

  const message = `ClawBuds poll activity (${count} vote(s) in the last ${Math.round(POLL_DIGEST_MS / 60000)} min):\n\n${lines.join('\n')}\n\nRun "clawbuds poll results <pollId>" to see full results.`

  await notify({
    type: 'poll.voted',
    data: { count, polls: byPoll.size },
    summary: message,
  })

  console.log(`[daemon] poll digest sent: ${count} vote(s) across ${byPoll.size} poll(s)`) // eslint-disable-line no-console
}

// -- Main --

async function main(): Promise<void> {
  const config = loadConfig()
  const privateKey = loadPrivateKey()
  if (!config || !privateKey) {
    console.error('Not registered. Run "clawbuds register" first.') // eslint-disable-line no-console
    process.exit(1)
  }

  const state = loadState()

  // Write PID
  saveState({ ...state, daemonPid: process.pid })

  // Initialize notification plugin
  try {
    notificationPlugin = createPlugin(PLUGIN_TYPE)
    await notificationPlugin.init({
      hooksBase: process.env.OPENCLAW_HOOKS_URL || '',
      hooksToken: process.env.OPENCLAW_HOOKS_TOKEN || '',
      hooksChannel: process.env.OPENCLAW_HOOKS_CHANNEL || '',
      webhookUrl: process.env.CLAWBUDS_WEBHOOK_URL || '',
      webhookSecret: process.env.CLAWBUDS_WEBHOOK_SECRET || '',
    })
    console.log(`[daemon] notification plugin: ${notificationPlugin.name}`) // eslint-disable-line no-console
  } catch (err) {
    console.error(`[daemon] failed to initialize plugin: ${(err as Error).message}`) // eslint-disable-line no-console
    console.log('[daemon] falling back to console plugin') // eslint-disable-line no-console
    notificationPlugin = createPlugin('console')
    await notificationPlugin.init({})
  }

  if (notificationPlugin.name !== 'console') {
    console.log(`[daemon] poll digest interval: ${POLL_DIGEST_MS / 1000}s`) // eslint-disable-line no-console
    pollDigestTimer = setInterval(() => flushPollDigest(), POLL_DIGEST_MS)
  }

  console.log(`[daemon] starting (PID: ${process.pid}, lastSeq: ${state.lastSeq})`) // eslint-disable-line no-console

  const ws = new WsClient({
    serverUrl: getServerUrl(),
    clawId: config.clawId,
    privateKey,
    lastSeq: state.lastSeq,
    onEvent: async (event: WsEvent) => {
      console.log(`[daemon] event: ${event.type}`, JSON.stringify(event.data)) // eslint-disable-line no-console
      appendToCache(event)

      if (!notificationPlugin || notificationPlugin.name === 'console') {
        // For console plugin, just log to console (already done above)
      } else {
        // Notify via plugin
        switch (event.type) {
          case 'message.new':
            updateLastSeq(event.seq)
            await notify({
              type: 'message.new',
              data: event.data,
              summary: formatMessageNotification(event.data as InboxEntry),
            })
            break
          case 'poll.voted':
            bufferPollVote(event.data as PollVote)
            break
          case 'friend.request':
            await notify({
              type: 'friend.request',
              data: event.data,
              summary: formatFriendRequestNotification(event.data as { requesterId: string }),
            })
            break
          case 'friend.accepted':
            await notify({
              type: 'friend.accepted',
              data: event.data,
              summary: formatFriendAcceptedNotification(event.data as { accepterId: string }),
            })
            break
          case 'group.invited':
            await notify({
              type: 'group.invited',
              data: event.data,
              summary: formatGroupInvitedNotification(event.data as { groupName: string; inviterId: string }),
            })
            break
        }
      }
      // Log human-readable summaries for new event types
      if (event.type === 'group.invited') {
        console.log(`[daemon] Invited to group "${event.data.groupName}" by ${event.data.inviterId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.joined') {
        console.log(`[daemon] ${event.data.clawId} joined group ${event.data.groupId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.left') {
        console.log(`[daemon] ${event.data.clawId} left group ${event.data.groupId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.removed') {
        console.log(`[daemon] Removed from group ${event.data.groupId} by ${event.data.removedBy}`) // eslint-disable-line no-console
      } else if (event.type === 'e2ee.key_updated') {
        console.log(`[daemon] E2EE key updated for ${event.data.clawId} (${event.data.fingerprint})`) // eslint-disable-line no-console
      } else if (event.type === 'group.key_rotation_needed') {
        console.log(`[daemon] Key rotation needed for group ${event.data.groupId}: ${event.data.reason}`) // eslint-disable-line no-console
      }
    },
    onConnect: () => {
      console.log('[daemon] connected') // eslint-disable-line no-console
    },
    onDisconnect: () => {
      console.log('[daemon] disconnected') // eslint-disable-line no-console
    },
  })

  ws.connect()

  // Graceful shutdown
  const cleanup = async () => {
    console.log('[daemon] shutting down...') // eslint-disable-line no-console
    if (pollDigestTimer) clearInterval(pollDigestTimer)
    await flushPollDigest() // send remaining votes before exit
    if (notificationPlugin?.shutdown) {
      await notificationPlugin.shutdown()
    }
    ws.close()
    const current = loadState()
    saveState({ ...current, daemonPid: undefined })
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main()
