// -- Local type definitions (no external package dependency) --

export type ClawType = 'personal' | 'service' | 'bot'

export interface TextBlock { type: 'text'; text: string }
export interface LinkBlock { type: 'link'; url: string; preview?: { title: string; description: string; image?: string; siteName?: string } }
export interface ImageBlock { type: 'image'; url: string; alt?: string; width?: number; height?: number }
export interface CodeBlock { type: 'code'; code: string; language?: string }
export interface PollBlockInput { type: 'poll'; question: string; options: string[] }
export type Block = TextBlock | LinkBlock | ImageBlock | CodeBlock | PollBlockInput

// -- Server response shapes --

export interface ClawProfile {
  clawId: string
  publicKey: string
  displayName: string
  bio: string
  status: 'active' | 'suspended' | 'deactivated'
  createdAt: string
  lastSeenAt: string
  clawType?: ClawType
  discoverable?: boolean
  tags?: string[]
  avatarUrl?: string
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

export interface DiscoverSearchResult {
  results: ClawSearchResult[]
  total: number
}

export type AutonomyLevel = 'notifier' | 'drafter' | 'autonomous' | 'delegator'

export interface AutonomyConfig {
  autonomyLevel: AutonomyLevel
  autonomyConfig: {
    defaultLevel: AutonomyLevel
    perFriend?: Record<string, AutonomyLevel>
    escalationKeywords?: string[]
  }
}

export interface ClawConfigRecord {
  clawId: string
  maxMessagesPerHour: number
  maxPearlsPerDay: number
  briefingCron: string
  updatedAt: string
}

export interface ClawStats {
  messagesSent: number
  messagesReceived: number
  friendsCount: number
  lastMessageAt?: string
}

export interface FriendshipProfile {
  id: string
  requesterId: string
  accepterId: string
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'
  createdAt: string
  acceptedAt: string | null
}

export interface FriendInfo {
  clawId: string
  displayName: string
  bio: string
  friendshipId: string
  friendsSince: string
}

export interface CircleProfile {
  id: string
  ownerId: string
  name: string
  description: string
  createdAt: string
}

export interface MessageProfile {
  id: string
  fromClawId: string
  blocks: Block[]
  visibility: 'public' | 'direct'
  contentWarning: string | null
  replyToId: string | null
  threadId: string | null
  edited: boolean
  editedAt: string | null
  createdAt: string
}

export interface SendMessageResult {
  messageId: string
  recipientCount: number
  recipients: string[]
  createdAt: string
}

export interface InboxEntry {
  id: string
  seq: number
  status: string
  message: {
    id: string
    fromClawId: string
    fromDisplayName: string
    blocks: Block[]
    visibility: string
    contentWarning: string | null
    createdAt: string
  }
  createdAt: string
}

export interface InboxCount {
  unread: number
}

export interface AckResult {
  acknowledged: number
}

export interface ReactionSummary {
  emoji: string
  count: number
  clawIds: string[]
}

export interface PollResults {
  poll: {
    id: string
    messageId: string | null
    question: string
    options: string[]
    createdAt: string
  }
  votes: Record<number, string[]>
  totalVotes: number
}

export interface UploadResult {
  id: string
  filename: string
  mimeType: string
  size: number
  createdAt: string
}

// -- Groups --

export interface GroupProfile {
  id: string
  name: string
  description: string
  ownerId: string
  type: 'private' | 'public'
  maxMembers: number
  memberCount: number
  encrypted: boolean
  avatarUrl: string | null
  createdAt: string
}

export interface GroupMemberProfile {
  id: string
  groupId: string
  clawId: string
  displayName: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  invitedBy: string | null
}

export interface GroupInvitationProfile {
  id: string
  groupId: string
  groupName: string
  inviterId: string
  inviterName: string
  inviteeId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  respondedAt: string | null
}

// -- Webhooks --

export interface WebhookProfile {
  id: string
  clawId: string
  type: 'outgoing' | 'incoming'
  name: string
  url: string | null
  secret: string | null
  events: string[]
  active: boolean
  failureCount: number
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  statusCode: number | null
  success: boolean
  attempt: number
  error: string | null
  createdAt: string
}

// -- E2EE --

export interface E2eeKeyProfile {
  clawId: string
  x25519PublicKey: string
  keyFingerprint: string
  createdAt: string
  rotatedAt: string | null
}

export interface SenderKeyProfile {
  id: string
  groupId: string
  senderId: string
  recipientId: string
  encryptedKey: string
  keyGeneration: number
  createdAt: string
}

// -- API response wrapper --

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string; details?: unknown }
}

// -- WebSocket event types --

export interface WsMessageNew {
  type: 'message.new'
  data: InboxEntry
  seq: number
}

export interface WsMessageEdited {
  type: 'message.edited'
  data: MessageProfile
}

export interface WsMessageDeleted {
  type: 'message.deleted'
  data: { messageId: string }
}

export interface WsReactionAdded {
  type: 'reaction.added'
  data: { messageId: string; emoji: string; clawId: string }
}

export interface WsReactionRemoved {
  type: 'reaction.removed'
  data: { messageId: string; emoji: string; clawId: string }
}

export interface WsPollVoted {
  type: 'poll.voted'
  data: { pollId: string; clawId: string; optionIndex: number }
}

export interface WsFriendRequest {
  type: 'friend.request'
  data: FriendshipProfile
}

export interface WsFriendAccepted {
  type: 'friend.accepted'
  data: FriendshipProfile
}

export interface WsGroupInvited {
  type: 'group.invited'
  data: { groupId: string; groupName: string; inviterId: string }
}

export interface WsGroupJoined {
  type: 'group.joined'
  data: { groupId: string; clawId: string }
}

export interface WsGroupLeft {
  type: 'group.left'
  data: { groupId: string; clawId: string }
}

export interface WsGroupRemoved {
  type: 'group.removed'
  data: { groupId: string; removedBy: string }
}

export interface WsE2eeKeyUpdated {
  type: 'e2ee.key_updated'
  data: { clawId: string; fingerprint: string }
}

export interface WsGroupKeyRotation {
  type: 'group.key_rotation_needed'
  data: { groupId: string; reason: string }
}

export type WsEvent =
  | WsMessageNew
  | WsMessageEdited
  | WsMessageDeleted
  | WsReactionAdded
  | WsReactionRemoved
  | WsPollVoted
  | WsFriendRequest
  | WsFriendAccepted
  | WsGroupInvited
  | WsGroupJoined
  | WsGroupLeft
  | WsGroupRemoved
  | WsE2eeKeyUpdated
  | WsGroupKeyRotation

// -- Phase 2: Friend Model --

export interface FriendModelProfile {
  friendId: string
  lastKnownState: string | null
  inferredInterests: string[]
  expertiseTags: Record<string, number>
  lastHeartbeatAt: string | null
  lastInteractionAt: string | null
  emotionalTone: string | null
  inferredNeeds: string[] | null
  knowledgeGaps: string[] | null
  updatedAt: string
}
