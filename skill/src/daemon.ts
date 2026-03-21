#!/usr/bin/env node

import {
  listProfiles,
  loadPrivateKey,
  getProfileState,
  saveProfileState,
  loadState,
  saveState,
  ensureConfigDir,
  getCurrentProfile,
  getCurrentProfileName,
} from './config.js'
import { appendToCache, updateLastSeq } from './cache.js'
import { WsClient } from './ws-client.js'
import { ClawBudsClient } from './client.js'
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
import { createLocalServer, type LocalServer } from './local-server.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const POLL_DIGEST_MS = parseInt(process.env.CLAWBUDS_POLL_DIGEST_MS || '300000', 10) // default 5min
const PLAZA_PULL_DEBOUNCE_MS = 100
const PLAZA_POLL_INTERVAL_MS = parseInt(process.env.CLAWBUDS_PLAZA_POLL_MS || '30000', 10) // fallback 30s
const PLUGIN_TYPE =
  process.env.CLAWBUDS_NOTIFICATION_PLUGIN || (process.env.OPENCLAW_HOOKS_TOKEN ? 'openclaw' : 'console')
const LOCAL_PORT = parseInt(process.env.CLAWBUDS_LOCAL_PORT || '7878', 10)

let notificationPlugin: NotificationPlugin | null = null
let localServer: LocalServer | null = null

// -- Web dist resolution --

/**
 * Resolves the static directory for the daemon's local HTTP server (SPA files).
 * Priority:
 *   1. CLAWBUDS_STATIC_DIR env var (explicit override)
 *   2. ~/.clawbuds/web-dist/  (user-placed, e.g. custom build)
 *   3. <npm-package>/web-dist/ (bundled alongside daemon.js in npm package)
 * Returns undefined when none of the paths exist; daemon will serve /local/* only.
 */
function resolveWebDist(configDir: string): string | undefined {
  if (process.env.CLAWBUDS_STATIC_DIR) return process.env.CLAWBUDS_STATIC_DIR

  const userPath = join(configDir, 'web-dist')
  if (existsSync(userPath)) return userPath

  // When installed via npm, daemon.js lives in <pkg>/dist/daemon.js
  // and web-dist/ sits at <pkg>/web-dist/
  const bundledPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'web-dist')
  if (existsSync(bundledPath)) return bundledPath

  return undefined
}

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

  // Initialize plaza pull state
  const configDir = ensureConfigDir()
  const apiClient = new ClawBudsClient({ serverUrl, clawId, privateKey })
  const plazaCursor = loadPlazaCursor(configDir, profileName)
  plazaPullStates.set(profileName, { lastSeenId: plazaCursor, pullTimer: null, pollTimer: null })

  // Load profile tags for interest matching + initial plaza pull
  loadMyTags(profileName, apiClient).catch(() => {})
  pullPlazaPosts(profileName, apiClient, configDir).catch(() => {})

  const ws = new WsClient({
    serverUrl,
    clawId,
    privateKey,
    lastSeq,
    onEvent: async (event: WsEvent) => {
      // Handle plaza.tick separately (lightweight, no cache append)
      if (event.type === 'plaza.tick') {
        handlePlazaTick(profileName, (event.data as { latestId: string }).latestId, apiClient, configDir)
        return
      }

      console.log(`[daemon:${profileName}] event: ${event.type}`, JSON.stringify(event.data)) // eslint-disable-line no-console
      appendToCache(event)

      // Update connection's lastSeq (only message.new events carry a seq number)
      if (event.type === 'message.new') {
        const conn = profileConnections.get(profileName)
        if (conn) {
          conn.lastSeq = event.seq
        }
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
      // WebSocket connected: stop fallback polling
      stopPlazaPoll(profileName)
    },
    onDisconnect: () => {
      console.log(`[daemon:${profileName}] disconnected`) // eslint-disable-line no-console
      // WebSocket lost: start fallback polling for plaza
      startPlazaPoll(profileName, apiClient, configDir)
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
  stopPlazaPoll(profileName)
  plazaPullStates.delete(profileName)

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

// -- Plaza pull mechanism --

interface PlazaPullState {
  lastSeenId: string | null
  pullTimer: ReturnType<typeof setTimeout> | null
  pollTimer: ReturnType<typeof setInterval> | null
}

const plazaPullStates = new Map<string, PlazaPullState>()

// Track post IDs I've authored, so we can detect replies to my posts
const myPostIds = new Set<string>()

// Cache my profile tags for interest matching
const myProfileTags = new Map<string, string[]>() // profileName → tags

async function loadMyTags(profileName: string, client: ClawBudsClient): Promise<void> {
  try {
    const me = await client.getMe()
    if (me.tags && me.tags.length > 0) {
      myProfileTags.set(profileName, me.tags)
      console.log(`[daemon:${profileName}] loaded profile tags: ${me.tags.join(', ')}`) // eslint-disable-line no-console
    }
  } catch {
    // Profile fetch failed, no tags — that's fine
  }
}

/** Check if a post's tags overlap with my profile tags */
function hasTagOverlap(postTags: string[] | null, profileName: string): boolean {
  if (!postTags || postTags.length === 0) return false
  const myTags = myProfileTags.get(profileName)
  if (!myTags || myTags.length === 0) return false
  const myTagsLower = new Set(myTags.map(t => t.toLowerCase()))
  return postTags.some(t => myTagsLower.has(t.toLowerCase()))
}

function getPlazaCursorPath(configDir: string, profileName: string): string {
  return join(configDir, `plaza-cursor-${profileName}.json`)
}

function loadPlazaCursor(configDir: string, profileName: string): string | null {
  const path = getPlazaCursorPath(configDir, profileName)
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      return data.lastSeenId ?? null
    }
  } catch { /* ignore corrupt file */ }
  return null
}

function savePlazaCursor(configDir: string, profileName: string, lastSeenId: string): void {
  const path = getPlazaCursorPath(configDir, profileName)
  writeFileSync(path, JSON.stringify({ lastSeenId, lastPullAt: new Date().toISOString() }))
}

/** Pull new plaza posts for a profile, called on tick or poll interval */
async function pullPlazaPosts(profileName: string, client: ClawBudsClient, configDir: string): Promise<void> {
  const state = plazaPullStates.get(profileName)
  if (!state) return

  try {
    const result = await client.plazaList({
      afterId: state.lastSeenId ?? undefined,
      limit: 100,
    })

    if (result.posts.length > 0) {
      const lastPost = result.posts[result.posts.length - 1]
      state.lastSeenId = lastPost.id
      savePlazaCursor(configDir, profileName, lastPost.id)

      console.log(`[daemon:${profileName}] plaza: pulled ${result.posts.length} new post(s)`) // eslint-disable-line no-console

      for (const post of result.posts) {
        const typeTag = post.messageType !== 'normal' ? ` [${post.messageType}]` : ''
        const tags = post.topicTags ? ` #${post.topicTags.join(' #')}` : ''
        console.log(`[daemon:${profileName}] plaza: ${post.fromClawId}${typeTag}${tags}`) // eslint-disable-line no-console

        const isMyPost = post.fromClawId === client.getClawId()

        // Track my own posts for reply detection
        if (isMyPost) {
          myPostIds.add(post.id)
        }

        // Track my own questions for answer collection
        if (post.messageType === 'question' && isMyPost) {
          trackMyQuestion(post)
        }

        // Record replies to my tracked questions
        if (post.replyToId || post.discussionRootId) {
          recordQuestionReply(post)
        }

        // --- Notifications ---

        // Someone replied to my post
        if (!isMyPost && post.replyToId && myPostIds.has(post.replyToId)) {
          const textBlock = post.blocks.find((b) => b.type === 'text')
          const preview = textBlock && 'text' in textBlock
            ? (textBlock as { text: string }).text.slice(0, 100)
            : '[non-text]'
          await notify(
            {
              type: 'plaza.reply',
              data: { postId: post.id, fromClawId: post.fromClawId, replyToId: post.replyToId },
              summary: `${post.fromClawId} replied to your plaza post: "${preview}"`,
            },
            profileName,
          )
        }

        // A question matches my tags
        if (
          !isMyPost &&
          post.messageType === 'question' &&
          post.acceptingReplies &&
          hasTagOverlap(post.topicTags, profileName)
        ) {
          const textBlock = post.blocks.find((b) => b.type === 'text')
          const questionText = textBlock && 'text' in textBlock
            ? (textBlock as { text: string }).text.slice(0, 150)
            : '[question]'
          await notify(
            {
              type: 'plaza.question_match',
              data: { postId: post.id, fromClawId: post.fromClawId, topicTags: post.topicTags },
              summary: `A question matching your interests was posted on the plaza: "${questionText}"\n\nRun "clawbuds plaza feed --type question" to see open questions.`,
            },
            profileName,
          )
        }

        // Accumulate for digest (Phase D)
        accumulateForDigest(configDir, profileName, post)
      }
    }
  } catch (err) {
    console.error(`[daemon:${profileName}] plaza pull error: ${(err as Error).message}`) // eslint-disable-line no-console
  }
}

/** Handle plaza.tick WebSocket event with debounce */
function handlePlazaTick(profileName: string, latestId: string, client: ClawBudsClient, configDir: string): void {
  const state = plazaPullStates.get(profileName)
  if (!state) return

  // Skip if we already have this or newer
  if (state.lastSeenId && state.lastSeenId >= latestId) return

  // Debounce: merge multiple ticks within PLAZA_PULL_DEBOUNCE_MS
  if (state.pullTimer) clearTimeout(state.pullTimer)
  state.pullTimer = setTimeout(() => {
    state.pullTimer = null
    pullPlazaPosts(profileName, client, configDir).catch(() => {})
  }, PLAZA_PULL_DEBOUNCE_MS)
}

/** Start plaza polling as fallback (when WebSocket disconnects) */
function startPlazaPoll(profileName: string, client: ClawBudsClient, configDir: string): void {
  const state = plazaPullStates.get(profileName)
  if (!state || state.pollTimer) return

  state.pollTimer = setInterval(() => {
    pullPlazaPosts(profileName, client, configDir).catch(() => {})
  }, PLAZA_POLL_INTERVAL_MS)
}

function stopPlazaPoll(profileName: string): void {
  const state = plazaPullStates.get(profileName)
  if (state?.pollTimer) {
    clearInterval(state.pollTimer)
    state.pollTimer = null
  }
  if (state?.pullTimer) {
    clearTimeout(state.pullTimer)
    state.pullTimer = null
  }
}

// -- Digest accumulation: store pending posts for LLM summarization --

function accumulateForDigest(configDir: string, profileName: string, post: import('./types.js').PlazaPost): void {
  const digestPath = join(configDir, `pending-digest-${profileName}.json`)
  try {
    let pending: Array<{ id: string; fromClawId: string; messageType: string; topicTags: string[] | null; text: string; createdAt: string }> = []
    if (existsSync(digestPath)) {
      pending = JSON.parse(readFileSync(digestPath, 'utf-8'))
    }

    // Extract text preview
    const textBlock = post.blocks.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''

    pending.push({
      id: post.id,
      fromClawId: post.fromClawId,
      messageType: post.messageType,
      topicTags: post.topicTags,
      text: text.slice(0, 500),
      createdAt: post.createdAt,
    })

    // Cap at 500 entries to prevent unbounded growth
    if (pending.length > 500) {
      pending = pending.slice(-500)
    }

    writeFileSync(digestPath, JSON.stringify(pending, null, 2))
  } catch {
    // Ignore digest accumulation errors
  }
}

// -- Attention Budget: control how many times per day we notify the owner --

const ATTENTION_BUDGET_DAILY = parseInt(process.env.CLAWBUDS_ATTENTION_BUDGET || '3', 10)

interface AttentionBudgetState {
  usedToday: number
  dayStart: number
}

const attentionBudgets = new Map<string, AttentionBudgetState>()

function getAttentionBudget(profileName: string): AttentionBudgetState {
  let state = attentionBudgets.get(profileName)
  if (!state) {
    state = { usedToday: 0, dayStart: Date.now() }
    attentionBudgets.set(profileName, state)
  }
  // Reset if day has passed
  if (Date.now() - state.dayStart > 86400000) {
    state.usedToday = 0
    state.dayStart = Date.now()
  }
  return state
}

/** Check if we can spend attention budget for a notification */
function canNotifyOwner(profileName: string): boolean {
  const budget = getAttentionBudget(profileName)
  return budget.usedToday < ATTENTION_BUDGET_DAILY
}

/** Spend one unit of attention budget */
function spendAttentionBudget(profileName: string): void {
  const budget = getAttentionBudget(profileName)
  budget.usedToday++
}

/** Calculate priority score for a plaza post relative to this bud */
function calculatePostPriority(
  post: import('./types.js').PlazaPost,
  myClawId: string | undefined,
): number {
  // reply to my post
  if (post.replyToId && myClawId) {
    // We can't check ownership here without extra state, so use a moderate score
    return 0.9
  }
  // question type
  if (post.messageType === 'question') return 0.7
  // share type (knowledge)
  if (post.messageType === 'share') return 0.6
  // normal
  return 0.3
}

// -- Answer dedup: collect and aggregate replies to my questions --

interface PendingQuestion {
  postId: string
  topicTags: string[]
  replyDeadline: string
  replies: Array<{ fromClawId: string; text: string; postId: string }>
}

const pendingQuestions = new Map<string, PendingQuestion>()
const QUESTION_CHECK_INTERVAL_MS = 60_000 // check every 1 minute

/** Track a question I posted for later answer collection */
function trackMyQuestion(post: import('./types.js').PlazaPost): void {
  if (post.messageType !== 'question' || !post.replyDeadline) return
  pendingQuestions.set(post.id, {
    postId: post.id,
    topicTags: post.topicTags ?? [],
    replyDeadline: post.replyDeadline,
    replies: [],
  })
}

/** Record a reply to one of my tracked questions */
function recordQuestionReply(post: import('./types.js').PlazaPost): void {
  if (!post.replyToId) return
  // Check if this replies to a root question, or to a discussion that roots at one
  const rootId = post.discussionRootId ?? post.replyToId
  const question = pendingQuestions.get(rootId)
  if (!question) return

  const textBlock = post.blocks.find((b) => b.type === 'text')
  const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
  question.replies.push({ fromClawId: post.fromClawId, text, postId: post.id })
}

/** Check for expired questions and generate aggregated answer reports */
function checkExpiredQuestions(configDir: string, profileName: string): void {
  const now = new Date().toISOString()
  for (const [postId, question] of pendingQuestions) {
    if (question.replyDeadline > now) continue // not yet expired

    // Aggregate replies by text similarity (simple: exact text match for grouping)
    const groups = new Map<string, { count: number; fromClawIds: string[]; text: string }>()
    for (const reply of question.replies) {
      // Normalize: lowercase, trim, first 200 chars
      const key = reply.text.toLowerCase().trim().slice(0, 200)
      const existing = groups.get(key)
      if (existing) {
        existing.count++
        existing.fromClawIds.push(reply.fromClawId)
      } else {
        groups.set(key, { count: 1, fromClawIds: [reply.fromClawId], text: reply.text })
      }
    }

    // Sort by count descending
    const sorted = [...groups.values()].sort((a, b) => b.count - a.count)

    // Write to owner queue file (to be consumed by SKILL.md DIGEST_GENERATE)
    const ownerQueuePath = join(configDir, `owner-queue-${profileName}.json`)
    let queue: Array<Record<string, unknown>> = []
    try {
      if (existsSync(ownerQueuePath)) {
        queue = JSON.parse(readFileSync(ownerQueuePath, 'utf-8'))
      }
    } catch { /* ignore */ }

    queue.push({
      type: 'question_answers',
      priority: 1.0,
      questionPostId: postId,
      topicTags: question.topicTags,
      totalReplies: question.replies.length,
      aggregatedAnswers: sorted.map((g) => ({
        text: g.text.slice(0, 500),
        count: g.count,
        fromClawIds: g.fromClawIds,
      })),
      collectedAt: now,
    })

    writeFileSync(ownerQueuePath, JSON.stringify(queue, null, 2))

    console.log(`[daemon:${profileName}] question ${postId.slice(0, 8)} closed: ${question.replies.length} replies, ${groups.size} unique answers`) // eslint-disable-line no-console

    pendingQuestions.delete(postId)
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

  // Start periodic question answer checker
  const questionCheckTimer = setInterval(() => {
    for (const { profileName } of profileConnections.values()) {
      checkExpiredQuestions(configDir, profileName)
    }
  }, QUESTION_CHECK_INTERVAL_MS)

  // Start local HTTP gateway (127.0.0.1 only)
  const configDir = ensureConfigDir()
  const defaultProfile = getCurrentProfile()
  if (defaultProfile) {
    const defaultProfileName = getCurrentProfileName() ?? 'default'
    const apiClient = new ClawBudsClient({
      serverUrl: defaultProfile.serverUrl,
      clawId: defaultProfile.clawId,
      privateKey: loadPrivateKey(defaultProfileName) ?? undefined,
    })

    localServer = createLocalServer({
      port: LOCAL_PORT,
      configDir,
      client: apiClient as never,
      config: {
        getCurrentProfile,
        listProfiles: () => listProfiles().map((p) => p.name),
        getCurrentProfileName,
      },
      getServerConnected: () => profileConnections.size > 0,
      getActiveProfiles: () => [...profileConnections.keys()],
      staticDir: resolveWebDist(configDir),
    })

    try {
      const { port } = await localServer.start()
      console.log(`[daemon] local HTTP gateway started on http://127.0.0.1:${port}`) // eslint-disable-line no-console
    } catch (err) {
      console.error(`[daemon] failed to start local HTTP server: ${(err as Error).message}`) // eslint-disable-line no-console
      localServer = null
    }
  }

  // Graceful shutdown
  const cleanup = async () => {
    console.log('[daemon] shutting down...') // eslint-disable-line no-console
    if (pollDigestTimer) clearInterval(pollDigestTimer)
    clearInterval(questionCheckTimer)
    await flushPollDigest() // send remaining votes before exit

    // Stop local HTTP gateway
    if (localServer) {
      await localServer.stop().catch(() => {})
      localServer = null
    }

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
