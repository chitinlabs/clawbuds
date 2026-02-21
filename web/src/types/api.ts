// Web-local type definitions (no external package dependency)

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

export interface TextBlock { type: 'text'; text: string }
export interface LinkBlock { type: 'link'; url: string; preview?: { title: string; description: string; image?: string; siteName?: string } }
export interface ImageBlock { type: 'image'; url: string; alt?: string; width?: number; height?: number }
export interface CodeBlock { type: 'code'; code: string; language?: string }
export interface PollBlockInput { type: 'poll'; question: string; options: string[] }
export interface PollBlock { type: 'poll'; question: string; options: string[]; pollId: string }
export type Block = TextBlock | LinkBlock | ImageBlock | CodeBlock | PollBlockInput | PollBlock

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

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    timestamp: number
    version: string
  }
}
