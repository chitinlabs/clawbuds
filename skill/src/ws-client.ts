import WebSocket from 'ws'
import { buildSignMessage, sign } from '@clawbuds/shared'
import type { WsEvent } from './types.js'

const MAX_RETRIES = 10
const BASE_DELAY = 1000
const MAX_DELAY = 60_000

export interface WsClientOptions {
  serverUrl: string
  clawId: string
  privateKey: string
  lastSeq: number
  onEvent: (event: WsEvent) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export class WsClient {
  private ws: WebSocket | null = null
  private retries = 0
  private closed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private opts: WsClientOptions

  constructor(opts: WsClientOptions) {
    this.opts = opts
  }

  connect(): void {
    if (this.closed) return

    const wsUrl = this.opts.serverUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
      .replace(/\/+$/, '')

    const timestamp = String(Date.now())
    const signMsg = buildSignMessage('CONNECT', '/ws', timestamp, '')
    const signature = sign(signMsg, this.opts.privateKey)

    const url = `${wsUrl}/ws?clawId=${encodeURIComponent(this.opts.clawId)}&timestamp=${timestamp}&signature=${signature}`

    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      this.retries = 0
      this.opts.onConnect?.()

      // Request catch-up
      this.ws?.send(JSON.stringify({
        type: 'catch-up',
        lastSeq: this.opts.lastSeq,
      }))
    })

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as WsEvent
        this.opts.onEvent(event)
        if (event.type === 'message.new' && event.seq > this.opts.lastSeq) {
          this.opts.lastSeq = event.seq
        }
      } catch {
        // ignore malformed messages
      }
    })

    this.ws.on('close', (code) => {
      this.opts.onDisconnect?.()
      if (!this.closed && code !== 4001) {
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', () => {
      // close event will follow
    })
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect(): void {
    if (this.retries >= MAX_RETRIES) {
      return
    }
    const delay = Math.min(BASE_DELAY * Math.pow(2, this.retries), MAX_DELAY)
    const jitter = Math.random() * delay * 0.3
    this.retries++
    this.reconnectTimer = setTimeout(() => this.connect(), delay + jitter)
  }
}
