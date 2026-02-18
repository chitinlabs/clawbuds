import { WebSocketServer, WebSocket } from 'ws'
import type { Server, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { verify, buildSignMessage } from '@clawbuds/shared'
import type { ClawService } from '../services/claw.service.js'
import type { InboxService } from '../services/inbox.service.js'
import type { EventBus } from '../services/event-bus.js'
import type { IRealtimeService, RealtimeMessage } from '../realtime/interfaces/realtime.interface.js'
import { WebSocketRealtimeService } from '../realtime/websocket/websocket-realtime.service.js'

const MAX_TIME_DIFF = 5 * 60 * 1000 // 5 minutes
const HEARTBEAT_INTERVAL = 30_000

interface WsClient {
  ws: WebSocket
  clawId: string
  alive: boolean
}

export class WebSocketManager {
  private wss: WebSocketServer
  private clients = new Map<string, WsClient>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private realtimeService: IRealtimeService

  constructor(
    private server: Server,
    private clawService: ClawService,
    private inboxService: InboxService,
    private eventBus: EventBus,
    realtimeService?: IRealtimeService,
  ) {
    this.realtimeService = realtimeService ?? new WebSocketRealtimeService()
    this.wss = new WebSocketServer({ noServer: true })

    this.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Wrap in async IIFE to handle async/await
      ;(async () => {
        const url = new URL(req.url ?? '', `http://${req.headers.host}`)
        if (url.pathname !== '/ws') {
          socket.destroy()
          return
        }

        const clawId = url.searchParams.get('clawId')
        const timestamp = url.searchParams.get('timestamp')
        const signature = url.searchParams.get('signature')

        if (!clawId || !timestamp || !signature) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }

        const requestTime = parseInt(timestamp, 10)
        if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > MAX_TIME_DIFF) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }

        const claw = await this.clawService.findById(clawId)
        if (!claw || claw.status !== 'active') {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }

        const message = buildSignMessage('CONNECT', '/ws', timestamp, '')
        const isValid = verify(signature, message, claw.publicKey)
        if (!isValid) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }

        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit('connection', ws, req, clawId)
        })
      })().catch((error) => {
        console.error('WebSocket upgrade error:', error)
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
        socket.destroy()
      })
    })

    this.wss.on('connection', (_ws: WebSocket, _req: IncomingMessage, clawId: string) => {
      // Close existing connection for same clawId
      const existing = this.clients.get(clawId)
      if (existing) {
        existing.ws.close(4001, 'replaced')
      }

      const client: WsClient = { ws: _ws, clawId, alive: true }
      this.clients.set(clawId, client)

      // Register connection with realtime service
      if (this.realtimeService instanceof WebSocketRealtimeService) {
        // WebSocket mode: register directly so sendToUser() can find this connection
        this.realtimeService.registerConnection(clawId, _ws)
      } else {
        // Redis PubSub mode: subscribe to this user's channel
        // When another node publishes to this user, we receive it here and forward to the local WebSocket
        this.subscribeUserChannel(clawId, _ws)
      }

      _ws.on('pong', () => {
        client.alive = true
      })

      _ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'catch-up') {
            this.handleCatchUp(client, msg.lastSeq ?? 0)
          }
        } catch {
          // Ignore malformed messages
        }
      })

      _ws.on('close', () => {
        // Only remove if this is still the active client for this clawId
        if (this.clients.get(clawId)?.ws === _ws) {
          this.clients.delete(clawId)
          // Unsubscribe from Redis channel when disconnected
          if (!(this.realtimeService instanceof WebSocketRealtimeService)) {
            this.unsubscribeUserChannel(clawId)
          }
        }
      })
    })

    this.setupEventListeners()
    this.startHeartbeat()
  }

  private setupEventListeners(): void {
    this.eventBus.on('message.new', ({ recipientId, entry }) => {
      this.sendTo(recipientId, {
        type: 'message.new',
        data: entry,
        seq: entry.seq,
      })
    })

    this.eventBus.on('message.edited', ({ recipientId, message }) => {
      this.sendTo(recipientId, {
        type: 'message.edited',
        data: message,
      })
    })

    this.eventBus.on('message.deleted', ({ recipientId, messageId }) => {
      this.sendTo(recipientId, {
        type: 'message.deleted',
        data: { messageId },
      })
    })

    this.eventBus.on('reaction.added', ({ recipientId, messageId, emoji, clawId }) => {
      this.sendTo(recipientId, {
        type: 'reaction.added',
        data: { messageId, emoji, clawId },
      })
    })

    this.eventBus.on('reaction.removed', ({ recipientId, messageId, emoji, clawId }) => {
      this.sendTo(recipientId, {
        type: 'reaction.removed',
        data: { messageId, emoji, clawId },
      })
    })

    this.eventBus.on('poll.voted', ({ recipientId, pollId, clawId, optionIndex }) => {
      this.sendTo(recipientId, {
        type: 'poll.voted',
        data: { pollId, clawId, optionIndex },
      })
    })

    this.eventBus.on('friend.request', ({ recipientId, friendship }) => {
      this.sendTo(recipientId, {
        type: 'friend.request',
        data: friendship,
      })
    })

    this.eventBus.on('friend.accepted', ({ recipientIds, friendship }) => {
      for (const recipientId of recipientIds) {
        this.sendTo(recipientId, {
          type: 'friend.accepted',
          data: friendship,
        })
      }
    })
  }

  private sendTo(clawId: string, payload: Record<string, unknown>): void {
    const message: RealtimeMessage = {
      type: payload.type as string,
      payload,
      timestamp: new Date().toISOString(),
    }

    // Always use IRealtimeService for delivery
    // - WebSocket mode: sends payload to local connection via registerConnection()
    // - Redis PubSub mode: publishes to Redis channel for cross-node delivery
    this.realtimeService.sendToUser(clawId, message).catch(() => {
      // Ignore delivery errors for offline users
    })
  }

  /**
   * Redis PubSub mode: subscribe to a user's channel so we can deliver
   * cross-node messages to their local WebSocket connection.
   */
  private subscribeUserChannel(clawId: string, ws: WebSocket): void {
    const channelKey = `user:${clawId}`
    this.realtimeService.subscribe(channelKey, (msg: RealtimeMessage) => {
      // Deliver the payload to the local WebSocket client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.payload))
      }
    }).catch(() => {
      // Ignore subscription errors
    })
  }

  /**
   * Redis PubSub mode: unsubscribe when user disconnects.
   */
  private unsubscribeUserChannel(clawId: string): void {
    const channelKey = `user:${clawId}`
    this.realtimeService.unsubscribe(channelKey).catch(() => {
      // Ignore unsubscription errors
    })
  }

  private async handleCatchUp(client: WsClient, lastSeq: number): Promise<void> {
    const entries = await this.inboxService.getInbox(client.clawId, {
      status: 'all',
      afterSeq: lastSeq,
      limit: 100,
    })

    for (const entry of entries) {
      this.sendTo(client.clawId, {
        type: 'message.new',
        data: entry,
        seq: entry.seq,
      })
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [clawId, client] of this.clients) {
        if (!client.alive) {
          client.ws.terminate()
          this.clients.delete(clawId)
          continue
        }
        client.alive = false
        client.ws.ping()
      }
    }, HEARTBEAT_INTERVAL)
  }

  getRealtimeService(): IRealtimeService {
    return this.realtimeService
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const client of this.clients.values()) {
      client.ws.close()
    }
    this.clients.clear()
    this.wss.close()
  }
}
