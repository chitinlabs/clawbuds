/**
 * WebSocket Realtime Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { WebSocketRealtimeService } from '../../../src/realtime/websocket/websocket-realtime.service.js'
import type { WebSocket } from 'ws'

// Mock WebSocket class
class MockWebSocket extends EventEmitter {
  readyState: number = 1 // WebSocket.OPEN
  messages: string[] = []

  send(data: string): void {
    this.messages.push(data)
  }

  close(): void {
    this.readyState = 3 // WebSocket.CLOSED
    this.emit('close')
  }
}

describe('WebSocketRealtimeService', () => {
  let service: WebSocketRealtimeService
  let ws1: MockWebSocket
  let ws2: MockWebSocket
  let ws3: MockWebSocket

  const userId1 = 'user-1'
  const userId2 = 'user-2'
  const userId3 = 'user-3'

  beforeEach(() => {
    service = new WebSocketRealtimeService()
    ws1 = new MockWebSocket()
    ws2 = new MockWebSocket()
    ws3 = new MockWebSocket()

    // Register connections
    service.registerConnection(userId1, ws1 as unknown as WebSocket)
    service.registerConnection(userId2, ws2 as unknown as WebSocket)
    service.registerConnection(userId3, ws3 as unknown as WebSocket)
  })

  afterEach(() => {
    // Clean up connections
    ws1.close()
    ws2.close()
    ws3.close()
  })

  describe('Connection Management', () => {
    it('should register WebSocket connection', () => {
      const newWs = new MockWebSocket()
      service.registerConnection('new-user', newWs as unknown as WebSocket)

      // Verify by sending a message
      const message = { type: 'test', payload: 'data', timestamp: new Date().toISOString() }
      service.sendToUser('new-user', message)

      expect(newWs.messages).toHaveLength(1)
      // sendToUser sends message.payload over the wire (not the full RealtimeMessage envelope)
      expect(JSON.parse(newWs.messages[0])).toBe('data')
    })

    it('should replace old connection when user reconnects', () => {
      const oldWs = new MockWebSocket()
      const newWs = new MockWebSocket()

      service.registerConnection('user-x', oldWs as unknown as WebSocket)
      service.registerConnection('user-x', newWs as unknown as WebSocket)

      // Old connection should be closed
      expect(oldWs.readyState).toBe(3) // CLOSED

      // New connection should receive messages
      const message = { type: 'test', payload: 'data', timestamp: new Date().toISOString() }
      service.sendToUser('user-x', message)

      expect(oldWs.messages).toHaveLength(0)
      expect(newWs.messages).toHaveLength(1)
    })

    it('should unregister connection on close', async () => {
      const stats1 = service.getStats()
      expect(stats1.connections).toBe(3)

      ws1.close()

      // Give time for event handler
      await new Promise((resolve) => setTimeout(resolve, 10))

      const stats2 = service.getStats()
      expect(stats2.connections).toBe(2)
    })

    it('should clean up rooms when connection closes', async () => {
      await service.joinRoom(userId1, 'room1')

      ws1.close()

      // Give time for event handler
      await new Promise((resolve) => setTimeout(resolve, 10))

      const roomUsers = await service.getRoomUsers('room1')
      expect(roomUsers).not.toContain(userId1)
    })
  })

  describe('sendToUser', () => {
    it('should send message to specific user', async () => {
      const message = {
        type: 'chat',
        payload: { text: 'Hello User 1' },
        timestamp: new Date().toISOString(),
      }

      await service.sendToUser(userId1, message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(0)
      expect(ws3.messages).toHaveLength(0)

      const received = JSON.parse(ws1.messages[0])
      // sendToUser sends message.payload over the wire
      expect(received).toMatchObject({ text: 'Hello User 1' })
    })

    it('should handle non-existent user', async () => {
      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      // Should not throw
      await expect(service.sendToUser('non-existent', message)).resolves.not.toThrow()
    })

    it('should not send to closed connection', async () => {
      ws1.readyState = 3 // CLOSED

      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.sendToUser(userId1, message)

      expect(ws1.messages).toHaveLength(0)
    })
  })

  describe('sendToUsers', () => {
    it('should send message to multiple users', async () => {
      const message = {
        type: 'notification',
        payload: { title: 'Alert' },
        timestamp: new Date().toISOString(),
      }

      await service.sendToUsers([userId1, userId2], message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(1)
      expect(ws3.messages).toHaveLength(0)
    })

    it('should handle mixed existent and non-existent users', async () => {
      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.sendToUsers([userId1, 'non-existent', userId2], message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(1)
    })
  })

  describe('broadcast', () => {
    it('should broadcast to all users in room', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.joinRoom(userId2, 'room1')

      const message = {
        type: 'room-message',
        payload: { text: 'Hello Room!' },
        timestamp: new Date().toISOString(),
      }

      await service.broadcast('room1', message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(1)
      expect(ws3.messages).toHaveLength(0)
    })

    it('should handle broadcast to empty room', async () => {
      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await expect(service.broadcast('empty-room', message)).resolves.not.toThrow()
    })

    it('should handle broadcast to non-existent room', async () => {
      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await expect(service.broadcast('non-existent', message)).resolves.not.toThrow()
    })
  })

  describe('subscribe/unsubscribe/publish', () => {
    it('should subscribe to channel and receive messages', async () => {
      const receivedMessages: any[] = []

      await service.subscribe('channel1', (message) => {
        receivedMessages.push(message)
      })

      const message = {
        type: 'event',
        payload: { data: 'test' },
        timestamp: new Date().toISOString(),
      }

      await service.publish('channel1', message)

      expect(receivedMessages).toHaveLength(1)
      expect(receivedMessages[0]).toMatchObject(message)
    })

    it('should support multiple subscribers on same channel', async () => {
      const received1: any[] = []
      const received2: any[] = []

      await service.subscribe('channel1', (message) => {
        received1.push(message)
      })

      await service.subscribe('channel1', (message) => {
        received2.push(message)
      })

      const message = {
        type: 'event',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.publish('channel1', message)

      expect(received1).toHaveLength(1)
      expect(received2).toHaveLength(1)
    })

    it('should unsubscribe from channel', async () => {
      const receivedMessages: any[] = []

      await service.subscribe('channel1', (message) => {
        receivedMessages.push(message)
      })

      await service.unsubscribe('channel1')

      const message = {
        type: 'event',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.publish('channel1', message)

      expect(receivedMessages).toHaveLength(0)
    })

    it('should handle async handlers', async () => {
      const receivedMessages: any[] = []

      await service.subscribe('channel1', async (message) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        receivedMessages.push(message)
      })

      const message = {
        type: 'event',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.publish('channel1', message)

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(receivedMessages).toHaveLength(1)
    })

    it('should handle errors in handlers', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      await service.subscribe('channel1', () => {
        throw new Error('Handler error')
      })

      const message = {
        type: 'event',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      // Should not throw
      await expect(service.publish('channel1', message)).resolves.not.toThrow()

      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('Room Management', () => {
    it('should add user to room', async () => {
      await service.joinRoom(userId1, 'room1')

      const users = await service.getRoomUsers('room1')
      expect(users).toContain(userId1)
    })

    it('should remove user from room', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.leaveRoom(userId1, 'room1')

      const users = await service.getRoomUsers('room1')
      expect(users).not.toContain(userId1)
    })

    it('should support multiple rooms per user', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.joinRoom(userId1, 'room2')
      await service.joinRoom(userId1, 'room3')

      const users1 = await service.getRoomUsers('room1')
      const users2 = await service.getRoomUsers('room2')
      const users3 = await service.getRoomUsers('room3')

      expect(users1).toContain(userId1)
      expect(users2).toContain(userId1)
      expect(users3).toContain(userId1)
    })

    it('should support multiple users per room', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.joinRoom(userId2, 'room1')
      await service.joinRoom(userId3, 'room1')

      const users = await service.getRoomUsers('room1')
      expect(users).toHaveLength(3)
      expect(users).toContain(userId1)
      expect(users).toContain(userId2)
      expect(users).toContain(userId3)
    })

    it('should remove empty room', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.leaveRoom(userId1, 'room1')

      const rooms = service.getRooms()
      expect(rooms).not.toContain('room1')
    })

    it('should throw error when joining room without connection', async () => {
      await expect(service.joinRoom('non-existent', 'room1')).rejects.toThrow()
    })

    it('should not throw when leaving room without connection', async () => {
      await expect(service.leaveRoom('non-existent', 'room1')).resolves.not.toThrow()
    })
  })

  describe('Statistics', () => {
    it('should return online count', async () => {
      const count = await service.getOnlineCount()
      expect(count).toBe(3)
    })

    it('should return stats', () => {
      const stats = service.getStats()

      expect(stats.connections).toBe(3)
      expect(stats.rooms).toBe(0)
      expect(stats.channels).toBe(0)
    })

    it('should update stats after room operations', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.joinRoom(userId2, 'room1')

      const stats = service.getStats()
      expect(stats.rooms).toBe(1)
    })

    it('should update stats after channel operations', async () => {
      await service.subscribe('channel1', () => {})
      await service.subscribe('channel2', () => {})

      const stats = service.getStats()
      expect(stats.channels).toBe(2)
    })
  })

  describe('Health Check', () => {
    it('should return true for ping', async () => {
      const result = await service.ping()
      expect(result).toBe(true)
    })
  })

  describe('Cleanup', () => {
    it('should clean up dead connections', () => {
      ws1.readyState = 3 // CLOSED
      ws2.readyState = 3 // CLOSED

      service.cleanup()

      const stats = service.getStats()
      expect(stats.connections).toBe(1) // Only ws3 remains
    })

    it('should not remove open connections', () => {
      service.cleanup()

      const stats = service.getStats()
      expect(stats.connections).toBe(3) // All connections remain
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle user leaving and rejoining room', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.leaveRoom(userId1, 'room1')
      await service.joinRoom(userId1, 'room1')

      const users = await service.getRoomUsers('room1')
      expect(users).toContain(userId1)
    })

    it('should broadcast to correct users after room changes', async () => {
      await service.joinRoom(userId1, 'room1')
      await service.joinRoom(userId2, 'room1')
      await service.joinRoom(userId3, 'room2')

      const message = {
        type: 'test',
        payload: 'data',
        timestamp: new Date().toISOString(),
      }

      await service.broadcast('room1', message)

      expect(ws1.messages).toHaveLength(1)
      expect(ws2.messages).toHaveLength(1)
      expect(ws3.messages).toHaveLength(0)
    })

    it('should handle message with different payload types', async () => {
      const messages = [
        { type: 'string', payload: 'text', timestamp: new Date().toISOString() },
        { type: 'number', payload: 123, timestamp: new Date().toISOString() },
        { type: 'object', payload: { key: 'value' }, timestamp: new Date().toISOString() },
        { type: 'array', payload: [1, 2, 3], timestamp: new Date().toISOString() },
      ]

      for (const message of messages) {
        await service.sendToUser(userId1, message)
      }

      expect(ws1.messages).toHaveLength(4)

      for (let i = 0; i < messages.length; i++) {
        // sendToUser sends message.payload over the wire
        const received = JSON.parse(ws1.messages[i])
        expect(received).toEqual(messages[i].payload)
      }
    })
  })
})
