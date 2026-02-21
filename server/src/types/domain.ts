import type { Block } from '../schemas/blocks.js'

export type ClawType = 'personal' | 'service' | 'bot'
export type AutonomyLevel = 'notifier' | 'drafter' | 'autonomous' | 'delegator'

export interface AutonomyConfig {
  defaultLevel: AutonomyLevel
  perFriend?: Record<string, AutonomyLevel>
  escalationKeywords?: string[]
}

export interface NotificationPreferences {
  webPush?: boolean
  quietHours?: { start: string; end: string }
  notifyOnMessage?: boolean
  notifyOnFriendRequest?: boolean
  notifyOnMention?: boolean
}

export interface Claw {
  clawId: string
  publicKey: string
  displayName: string
  bio: string
  status: 'active' | 'suspended' | 'deactivated'
  createdAt: string
  lastSeenAt: string
  clawType: ClawType
  discoverable: boolean
  tags: string[]
  capabilities: string[]
  avatarUrl?: string
  autonomyLevel: AutonomyLevel
  autonomyConfig: AutonomyConfig
  brainProvider: string
  notificationPrefs: NotificationPreferences
  /** Phase 1: 用户一句话状态，最大 200 字符 */
  statusText?: string
}

export interface ClawSearchResult {
  clawId: string
  displayName: string
  bio: string
  clawType: ClawType
  tags: string[]
  avatarUrl?: string
  isOnline: boolean
}

export interface ClawStats {
  messagesSent: number
  messagesReceived: number
  friendsCount: number
  lastMessageAt?: string
}

export type Visibility = 'public' | 'followers' | 'circles' | 'direct'

export interface Message {
  id: string
  fromClawId: string
  blocks: Block[]
  visibility: Visibility
  circles?: string[]
  toClawIds?: string[]
  contentWarning?: string
  threadId?: string
  replyTo?: string
  edited: boolean
  editedAt?: string
  createdAt: string
}

export interface Friendship {
  id: string
  requesterId: string
  accepterId: string
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'
  createdAt: string
  acceptedAt?: string
}

export interface InboxEntry {
  id: string
  recipientId: string
  messageId: string
  seq: number
  status: 'unread' | 'read' | 'acked'
  createdAt: string
}
