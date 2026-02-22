/**
 * web/src/pages/CarapacePage.tsx
 * Phase 13b-4: Carapace editor page (requires daemon local API)
 */
import { useEffect, useRef, useState } from 'react'
import type { CarapaceHistoryEntry } from '../types/api.js'
import * as api from '@/lib/api-client'
import { createLocalApiClient, type LocalApiClient } from '../lib/local-api-client.js'

export default function CarapacePage() {
  const [content, setContent] = useState<string | null>(null)
  const [history, setHistory] = useState<CarapaceHistoryEntry[]>([])
  const [daemonAvailable, setDaemonAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [edited, setEdited] = useState<string>('')

  const clientRef = useRef<LocalApiClient | null>(null)
  if (!clientRef.current) {
    clientRef.current = createLocalApiClient()
  }

  const fetchData = async () => {
    const client = clientRef.current!
    try {
      // Try daemon first
      const localContent = await client.getCarapace()
      if (localContent !== null) {
        setDaemonAvailable(true)
        setContent(localContent)
        setEdited(localContent)
      } else {
        setDaemonAvailable(false)
        setContent(null)
      }

      // Always load history from server
      const h = await api.getCarapaceHistory()
      setHistory(h)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load carapace')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSave = async () => {
    const client = clientRef.current!
    setSaving(true)
    setError(null)
    try {
      const result = await client.putCarapace(edited, 'manual')
      if (result) {
        setContent(edited)
        setSuccessMsg(`Saved as version ${result.version}`)
        const h = await api.getCarapaceHistory()
        setHistory(h)
      } else {
        setError('Failed to save — daemon not reachable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    const client = clientRef.current!
    setSyncing(true)
    setError(null)
    try {
      const version = await client.syncCarapace()
      if (version !== null) {
        setSuccessMsg(`Synced to version ${version}`)
        const localContent = await client.getCarapace()
        if (localContent !== null) {
          setContent(localContent)
          setEdited(localContent)
        }
      } else {
        setError('Sync failed — daemon not reachable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading Carapace Editor...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Carapace Editor</h1>
        <div className="flex gap-2">
          {daemonAvailable && (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="rounded bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync from Server'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || edited === content}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {successMsg && <p className="text-green-600 text-sm">{successMsg}</p>}

      {!daemonAvailable ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-700">
            Daemon not available — start the daemon to edit your carapace locally.
          </p>
        </div>
      ) : (
        <textarea
          value={edited}
          onChange={(e) => {
            setEdited(e.target.value)
            setSuccessMsg(null)
          }}
          rows={20}
          className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm focus:border-indigo-500 focus:outline-none"
          placeholder="# Carapace&#10;&#10;Write your carapace rules here..."
        />
      )}

      {/* Version history */}
      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-gray-700">Version History</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {history.map((entry) => (
              <li key={entry.version} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium text-gray-700">Version {entry.version}</span>
                <span className="text-xs text-gray-400">{entry.reason}</span>
                <span className="text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
