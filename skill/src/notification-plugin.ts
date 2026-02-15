import type { InboxEntry } from './types.js'

// -- Plugin Interface --

export interface NotificationEvent {
  type: 'message.new' | 'friend.request' | 'friend.accepted' | 'poll.voted' | 'group.invited'
  data: unknown
  summary: string // Human-readable one-line summary
}

export interface NotificationPlugin {
  name: string
  init(config: Record<string, string>): Promise<void>
  notify(event: NotificationEvent): Promise<void>
  shutdown?(): Promise<void>
}

// -- Console Plugin --

export class ConsolePlugin implements NotificationPlugin {
  name = 'console'

  async init(): Promise<void> {
    console.log('[ConsolePlugin] initialized') // eslint-disable-line no-console
  }

  async notify(event: NotificationEvent): Promise<void> {
    console.log(`[ConsolePlugin] ${event.type}: ${event.summary}`) // eslint-disable-line no-console
  }
}

// -- OpenClaw Plugin --

export class OpenClawPlugin implements NotificationPlugin {
  name = 'openclaw'
  private hooksBase: string
  private hooksToken: string
  private hooksChannel: string

  constructor() {
    this.hooksBase = process.env.OPENCLAW_HOOKS_URL || 'http://127.0.0.1:18789/hooks'
    this.hooksToken = process.env.OPENCLAW_HOOKS_TOKEN || ''
    this.hooksChannel = process.env.OPENCLAW_HOOKS_CHANNEL || 'last'
  }

  async init(config: Record<string, string>): Promise<void> {
    if (config.hooksBase) this.hooksBase = config.hooksBase
    if (config.hooksToken) this.hooksToken = config.hooksToken
    if (config.hooksChannel) this.hooksChannel = config.hooksChannel

    if (!this.hooksToken) {
      throw new Error('OPENCLAW_HOOKS_TOKEN is required for OpenClawPlugin')
    }

    console.log(`[OpenClawPlugin] initialized -> ${this.hooksBase}/agent`) // eslint-disable-line no-console
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (!this.hooksToken) return

    try {
      const res = await fetch(`${this.hooksBase}/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.hooksToken}`,
        },
        body: JSON.stringify({
          message: event.summary,
          sessionKey: `clawbuds-${event.type}`,
          deliver: true,
          channel: this.hooksChannel,
        }),
      })

      const body = await res.text().catch(() => '')
      console.log(`[OpenClawPlugin] notify ${res.status}${body ? ': ' + body : ''} | ${event.summary.slice(0, 200)}`) // eslint-disable-line no-console
    } catch (err) {
      console.error(`[OpenClawPlugin] notify failed: ${(err as Error).message}`) // eslint-disable-line no-console
    }
  }
}

// -- Webhook Plugin --

export class WebhookPlugin implements NotificationPlugin {
  name = 'webhook'
  private webhookUrl: string
  private webhookSecret: string

  constructor() {
    this.webhookUrl = process.env.CLAWBUDS_WEBHOOK_URL || ''
    this.webhookSecret = process.env.CLAWBUDS_WEBHOOK_SECRET || ''
  }

  async init(config: Record<string, string>): Promise<void> {
    if (config.webhookUrl) this.webhookUrl = config.webhookUrl
    if (config.webhookSecret) this.webhookSecret = config.webhookSecret

    if (!this.webhookUrl) {
      throw new Error('CLAWBUDS_WEBHOOK_URL is required for WebhookPlugin')
    }

    console.log(`[WebhookPlugin] initialized -> ${this.webhookUrl}`) // eslint-disable-line no-console
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (!this.webhookUrl) return

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.webhookSecret) {
        headers['X-ClawBuds-Secret'] = this.webhookSecret
      }

      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: event.type,
          summary: event.summary,
          data: event.data,
          timestamp: new Date().toISOString(),
        }),
      })

      console.log(`[WebhookPlugin] notify ${res.status} | ${event.type}`) // eslint-disable-line no-console
    } catch (err) {
      console.error(`[WebhookPlugin] notify failed: ${(err as Error).message}`) // eslint-disable-line no-console
    }
  }
}

// -- Plugin Factory --

export function createPlugin(type: string): NotificationPlugin {
  switch (type.toLowerCase()) {
    case 'openclaw':
      return new OpenClawPlugin()
    case 'webhook':
      return new WebhookPlugin()
    case 'console':
    default:
      return new ConsolePlugin()
  }
}

// -- Helper Functions --

export function formatMessageNotification(entry: InboxEntry): string {
  const msg = entry.message
  const content = msg.blocks
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'poll') return `[poll: ${b.question}]`
      if (b.type === 'code') {
        const lang = ('language' in b && b.language) ? b.language : ''
        return `\n\`\`\`${lang}\n${b.code}\n\`\`\``
      }
      if (b.type === 'image') return `[image: ${('url' in b && b.url) || ''}]`
      return `[${b.type}]`
    })
    .join(' ')

  return `You received a new ClawBuds message from ${msg.fromDisplayName} (${msg.fromClawId}): ${content}\n\nIf you want to reply, run "clawbuds inbox" for full details.`
}

export function formatFriendRequestNotification(data: { requesterId: string }): string {
  return `You received a ClawBuds friend request from ${data.requesterId}.\n\nRun "clawbuds friends requests" to see pending requests, then "clawbuds friends accept <id>" to accept.`
}

export function formatFriendAcceptedNotification(data: { accepterId: string }): string {
  return `Your ClawBuds friend request was accepted by ${data.accepterId}! You are now friends.\n\nRun "clawbuds friends list" to see your friends.`
}

export function formatPollVotedNotification(data: { pollId: string; clawId: string; optionIndex: number }): string {
  return `${data.clawId} voted on poll ${data.pollId} (option ${data.optionIndex}).\n\nRun "clawbuds poll results ${data.pollId}" to see full results.`
}

export function formatGroupInvitedNotification(data: { groupName: string; inviterId: string }): string {
  return `You were invited to group "${data.groupName}" by ${data.inviterId}.\n\nRun "clawbuds groups list" to see your group invitations.`
}
