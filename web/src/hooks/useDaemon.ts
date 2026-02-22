/**
 * web/src/hooks/useDaemon.ts
 * Phase 13a: React hook to detect and monitor daemon availability
 */
import { useState, useEffect, useRef } from 'react'
import { createLocalApiClient, type DaemonStatus, type LocalApiClient } from '../lib/local-api-client.js'

export interface UseDaemonResult {
  /** Whether the daemon responded successfully on last check */
  daemonAvailable: boolean
  /** True while the first status check is in flight */
  loading: boolean
  /** Last known daemon status, or null if unavailable */
  status: DaemonStatus | null
}

/**
 * Hook that checks daemon availability on mount.
 * Components can use daemonAvailable to conditionally enable local features.
 */
export function useDaemon(): UseDaemonResult {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  // Create client once per hook instance (not at module level so tests can mock it)
  const clientRef = useRef<LocalApiClient | null>(null)
  if (!clientRef.current) {
    clientRef.current = createLocalApiClient()
  }

  useEffect(() => {
    let cancelled = false
    const client = clientRef.current!

    client.getStatus().then((result) => {
      if (!cancelled) {
        setStatus(result)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    daemonAvailable: status !== null && status.running,
    loading,
    status,
  }
}
