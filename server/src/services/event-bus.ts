import { EventEmitter } from 'node:events'
import type { InboxEntry } from './inbox.service.js'
import type { FriendshipProfile } from './friendship.service.js'
import type { MessageProfile } from './message.service.js'
import type { DunbarLayer } from '../db/repositories/interfaces/relationship-strength.repository.interface.js'

export interface HeartbeatPayload {
  interests?: string[]
  availability?: string
  recentTopics?: string
  isKeepalive: boolean
}

export interface EventMap {
  'message.new': { recipientId: string; entry: InboxEntry }
  'message.edited': { recipientId: string; message: MessageProfile }
  'message.deleted': { recipientId: string; messageId: string }
  'reaction.added': { recipientId: string; messageId: string; emoji: string; clawId: string }
  'reaction.removed': { recipientId: string; messageId: string; emoji: string; clawId: string }
  'poll.voted': { recipientId: string; pollId: string; clawId: string; optionIndex: number }
  'friend.request': { recipientId: string; friendship: FriendshipProfile }
  'friend.accepted': { recipientIds: [string, string]; friendship: FriendshipProfile }
  'friend.removed': { clawId: string; friendId: string }
  'group.invited': { recipientId: string; groupId: string; groupName: string; inviterId: string }
  'group.joined': { recipientId: string; groupId: string; clawId: string }
  'group.left': { recipientId: string; groupId: string; clawId: string }
  'group.removed': { recipientId: string; groupId: string; removedBy: string }
  'e2ee.key_updated': { clawId: string; fingerprint: string }
  'group.key_rotation_needed': { recipientId: string; groupId: string; reason: string }
  // Phase 1: Social Heartbeat
  'heartbeat.received': { fromClawId: string; toClawId: string; payload: HeartbeatPayload }
  'relationship.layer_changed': {
    clawId: string
    friendId: string
    oldLayer: DunbarLayer
    newLayer: DunbarLayer
    strength: number
  }
}

export type EventName = keyof EventMap

export class EventBus {
  private emitter = new EventEmitter()

  emit<K extends EventName>(event: K, data: EventMap[K]): void {
    this.emitter.emit(event, data)
  }

  on<K extends EventName>(event: K, listener: (data: EventMap[K]) => void): void {
    this.emitter.on(event, listener)
  }

  off<K extends EventName>(event: K, listener: (data: EventMap[K]) => void): void {
    this.emitter.off(event, listener)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }
}
