#!/usr/bin/env node

import {
  listProfiles,
  loadPrivateKey,
  getProfileState,
  saveProfileState,
  loadState,
  saveState,
} from './config.js'
import { appendToCache, updateLastSeq } from './cache.js'
import { WsClient } from './ws-client.js'
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
const PLUGIN_TYPE =
  process.env.CLAWBUDS_NOTIFICATION_PLUGIN || (process.env.OPENCLAW_HOOKS_TOKEN ? 'openclaw' : 'console')

let notificationPlugin: NotificationPlugin | null = null

// -- Profile connection tracking --

interface ProfileConnection {
  profileName: string
  clawId: string
  ws: WsClient
  lastSeq: number
}

const profileConnections = new Map<string, ProfileConnection>()

// -- Notification wrapper --

async function notify(event: NotificationEvent, profileName: string): Promise<void> {
  if (notificationPlugin) {
    // Add profile context to notification
    const eventWithProfile = {
      ...event,
      data: {
        ...event.data,
        _profile: profileName,
      },
    }
    await notificationPlugin.notify(eventWithProfile)
  }
}

// -- Poll vote digest (global across all profiles) --

interface PollVote {
  pollId: string
  clawId: string
  optionIndex: number
  profileName: string
}

const pollVoteBuffer: PollVote[] = []
let pollDigestTimer: ReturnType<typeof setInterval> | null = null

function bufferPollVote(data: PollVote): void {
  pollVoteBuffer.push(data)
  console.log(
    `[daemon:${data.profileName}] poll vote buffered (${pollVoteBuffer.length} pending, digest in ${Math.round(POLL_DIGEST_MS / 1000)}s)`,
  ) // eslint-disable-line no-console
}

async function flushPollDigest(): Promise<void> {
  if (pollVoteBuffer.length === 0) return

  // Group by profile and pollId
  const byProfile = new Map<string, Map<string, PollVote[]>>()
  for (const v of pollVoteBuffer) {
    let profileMap = byProfile.get(v.profileName)
    if (!profileMap) {
      profileMap = new Map()
      byProfile.set(v.profileName, profileMap)
    }
    const pollList = profileMap.get(v.pollId) || []
    pollList.push(v)
    profileMap.set(v.pollId, pollList)
  }

  // Send notification for each profile
  for (const [profileName, pollMap] of byProfile) {
    const lines: string[] = []
    let totalVotes = 0

    for (const [pollId, votes] of pollMap) {
      totalVotes += votes.length
      const summary = votes.map((v) => `${v.clawId} voted option ${v.optionIndex}`).join(', ')
      lines.push(`Poll ${pollId}: ${votes.length} new vote(s) — ${summary}`)
    }

    const message = `ClawBuds poll activity [${profileName}] (${totalVotes} vote(s) in the last ${Math.round(POLL_DIGEST_MS / 60000)} min):\n\n${lines.join('\n')}\n\nRun "clawbuds poll results <pollId> --profile ${profileName}" to see full results.`

    await notify(
      {
        type: 'poll.voted',
        data: { count: totalVotes, polls: pollMap.size },
        summary: message,
      },
      profileName,
    )

    console.log(`[daemon:${profileName}] poll digest sent: ${totalVotes} vote(s) across ${pollMap.size} poll(s)`) // eslint-disable-line no-console
  }

  pollVoteBuffer.length = 0
}

// -- Profile connection management --

function connectProfile(
  profileName: string,
  serverUrl: string,
  clawId: string,
  privateKey: string,
  lastSeq: number,
): void {
  console.log(`[daemon:${profileName}] connecting to ${serverUrl} (lastSeq: ${lastSeq})`) // eslint-disable-line no-console

  const ws = new WsClient({
    serverUrl,
    clawId,
    privateKey,
    lastSeq,
    onEvent: async (event: WsEvent) => {
      console.log(`[daemon:${profileName}] event: ${event.type}`, JSON.stringify(event.data)) // eslint-disable-line no-console
      appendToCache(event)

      // Update connection's lastSeq
      const conn = profileConnections.get(profileName)
      if (conn) {
        conn.lastSeq = event.seq
      }

      if (!notificationPlugin || notificationPlugin.name === 'console') {
        // For console plugin, just log to console (already done above)
      } else {
        // Notify via plugin
        switch (event.type) {
          case 'message.new':
            updateLastSeq(event.seq)
            await notify(
              {
                type: 'message.new',
                data: event.data,
                summary: formatMessageNotification(event.data as InboxEntry),
              },
              profileName,
            )
            break
          case 'poll.voted':
            bufferPollVote({
              ...(event.data as { pollId: string; clawId: string; optionIndex: number }),
              profileName,
            })
            break
          case 'friend.request':
            await notify(
              {
                type: 'friend.request',
                data: event.data,
                summary: formatFriendRequestNotification(event.data as { requesterId: string }),
              },
              profileName,
            )
            break
          case 'friend.accepted':
            await notify(
              {
                type: 'friend.accepted',
                data: event.data,
                summary: formatFriendAcceptedNotification(event.data as { accepterId: string }),
              },
              profileName,
            )
            break
          case 'group.invited':
            await notify(
              {
                type: 'group.invited',
                data: event.data,
                summary: formatGroupInvitedNotification(event.data as { groupName: string; inviterId: string }),
              },
              profileName,
            )
            break
        }
      }

      // Log human-readable summaries for new event types
      if (event.type === 'group.invited') {
        console.log(`[daemon:${profileName}] Invited to group "${event.data.groupName}" by ${event.data.inviterId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.joined') {
        console.log(`[daemon:${profileName}] ${event.data.clawId} joined group ${event.data.groupId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.left') {
        console.log(`[daemon:${profileName}] ${event.data.clawId} left group ${event.data.groupId}`) // eslint-disable-line no-console
      } else if (event.type === 'group.removed') {
        console.log(`[daemon:${profileName}] Removed from group ${event.data.groupId} by ${event.data.removedBy}`) // eslint-disable-line no-console
      } else if (event.type === 'e2ee.key_updated') {
        console.log(`[daemon:${profileName}] E2EE key updated for ${event.data.clawId} (${event.data.fingerprint})`) // eslint-disable-line no-console
      } else if (event.type === 'group.key_rotation_needed') {
        console.log(`[daemon:${profileName}] Key rotation needed for group ${event.data.groupId}: ${event.data.reason}`) // eslint-disable-line no-console
      }
    },
    onConnect: () => {
      console.log(`[daemon:${profileName}] connected`) // eslint-disable-line no-console
    },
    onDisconnect: () => {
      console.log(`[daemon:${profileName}] disconnected`) // eslint-disable-line no-console
    },
  })

  ws.connect()

  profileConnections.set(profileName, {
    profileName,
    clawId,
    ws,
    lastSeq,
  })
}

function disconnectProfile(profileName: string): void {
  const conn = profileConnections.get(profileName)
  if (conn) {
    console.log(`[daemon:${profileName}] disconnecting...`) // eslint-disable-line no-console
    conn.ws.close()

    // Save final state
    saveProfileState(profileName, {
      lastSeq: conn.lastSeq,
    })

    profileConnections.delete(profileName)
  }
}

// -- Main --

async function main(): Promise<void> {
  const profiles = listProfiles()

  if (profiles.length === 0) {
    console.error('No profiles registered. Run "clawbuds register" first.') // eslint-disable-line no-console
    process.exit(1)
  }

  // Write global daemon PID
  const globalState = loadState()
  saveState({
    ...globalState,
    _daemonPid: process.pid,
  })

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

  console.log(`[daemon] starting (PID: ${process.pid}, managing ${profiles.length} profile(s))`) // eslint-disable-line no-console

  // Connect all profiles
  for (const { name, profile } of profiles) {
    const privateKey = loadPrivateKey(name)
    if (!privateKey) {
      console.error(`[daemon:${name}] private key not found, skipping`) // eslint-disable-line no-console
      continue
    }

    const state = getProfileState(name)
    connectProfile(name, profile.serverUrl, profile.clawId, privateKey, state.lastSeq)
  }

  if (profileConnections.size === 0) {
    console.error('[daemon] no profiles could be connected') // eslint-disable-line no-console
    process.exit(1)
  }

  console.log(`[daemon] connected ${profileConnections.size} profile(s)`) // eslint-disable-line no-console

  // Graceful shutdown
  const cleanup = async () => {
    console.log('[daemon] shutting down...') // eslint-disable-line no-console
    if (pollDigestTimer) clearInterval(pollDigestTimer)
    await flushPollDigest() // send remaining votes before exit

    // Disconnect all profiles
    for (const profileName of profileConnections.keys()) {
      disconnectProfile(profileName)
    }

    if (notificationPlugin?.shutdown) {
      await notificationPlugin.shutdown()
    }

    // Clear global daemon PID
    const current = loadState()
    delete current._daemonPid
    saveState(current)

    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main()
