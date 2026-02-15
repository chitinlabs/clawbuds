import { useEffect, useRef, useCallback } from 'react'
import { buildSignMessage, sign } from '@clawbuds/shared/crypto/ed25519'
import { useAuthStore } from '@/stores/auth.store'
import { useRealtimeStore } from '@/stores/realtime.store'

const MAX_RECONNECT_DELAY = 30_000
const INITIAL_RECONNECT_DELAY = 1_000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)

  const { clawId, privateKey, isAuthenticated } = useAuthStore()
  const { setConnected, pushEvent, isConnected } = useRealtimeStore()

  const connect = useCallback(() => {
    if (!clawId || !privateKey || !isAuthenticated) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const timestamp = String(Date.now())
    const message = buildSignMessage('CONNECT', '/ws', timestamp, '')
    const signature = sign(message, privateKey)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws?clawId=${encodeURIComponent(clawId)}&timestamp=${timestamp}&signature=${signature}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }
        pushEvent(data)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect with exponential backoff
      if (isAuthenticated) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY,
          )
          connect()
        }, reconnectDelayRef.current)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [clawId, privateKey, isAuthenticated, setConnected, pushEvent])

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [setConnected])

  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [isAuthenticated, connect, disconnect])

  return { isConnected }
}
