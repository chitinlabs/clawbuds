import { create } from 'zustand'
import type { InboxEntry, Friendship } from '@clawbuds/shared/types/claw'

export interface WsEvent {
  type: string
  data: unknown
}

interface RealtimeState {
  isConnected: boolean
  lastEvent: WsEvent | null
  newInboxEntries: InboxEntry[]
  friendEvents: Friendship[]
  setConnected: (connected: boolean) => void
  pushEvent: (event: WsEvent) => void
  clearInboxEntries: () => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  isConnected: false,
  lastEvent: null,
  newInboxEntries: [],
  friendEvents: [],

  setConnected: (connected) => set({ isConnected: connected }),

  pushEvent: (event) =>
    set((state) => {
      const updates: Partial<RealtimeState> = { lastEvent: event }

      if (event.type === 'message.new' || event.type === 'inbox.new') {
        updates.newInboxEntries = [...state.newInboxEntries, event.data as InboxEntry]
      }

      if (event.type === 'friend.request' || event.type === 'friend.accepted') {
        updates.friendEvents = [...state.friendEvents, event.data as Friendship]
      }

      return updates
    }),

  clearInboxEntries: () => set({ newInboxEntries: [] }),
}))
