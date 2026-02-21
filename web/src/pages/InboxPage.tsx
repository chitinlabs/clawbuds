import { useEffect, useState } from 'react'
import type { InboxEntry } from '../types/api.js'
import * as api from '@/lib/api-client'
import ConversationDetail from './ConversationDetail'

export default function InboxPage() {
  const [entries, setEntries] = useState<InboxEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadInbox()
  }, [])

  const loadInbox = async () => {
    try {
      const data = await api.getInbox({ status: 'all', limit: 50 })
      setEntries(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox')
    } finally {
      setLoading(false)
    }
  }

  const handleAck = async (entryId: string) => {
    try {
      await api.ackInbox([entryId])
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: 'acked' as const } : e)),
      )
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading inbox...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  return (
    <div className="flex h-full gap-4">
      {/* Inbox list — full width on mobile when no selection, side panel on desktop */}
      <div
        className={`w-full shrink-0 overflow-auto rounded-lg border border-gray-200 bg-white md:w-80 ${
          selectedId ? 'hidden md:block' : ''
        }`}
      >
        <h2 className="border-b border-gray-200 px-4 py-3 text-lg font-semibold">Inbox</h2>
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No messages</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <li
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className={`cursor-pointer px-4 py-3 hover:bg-gray-50 ${
                  selectedId === entry.id ? 'bg-blue-50' : ''
                } ${entry.status === 'unread' ? 'font-medium' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-800">#{entry.seq}</span>
                  <span
                    className={`text-xs ${
                      entry.status === 'unread' ? 'text-blue-600' : 'text-gray-400'
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail panel — full width on mobile, side panel on desktop */}
      <div
        className={`flex-1 overflow-auto rounded-lg border border-gray-200 bg-white ${
          selectedId ? '' : 'hidden md:flex'
        }`}
      >
        {selectedId ? (
          <div className="h-full">
            {/* Back button on mobile */}
            <button
              onClick={() => setSelectedId(null)}
              className="border-b border-gray-200 px-4 py-2 text-sm text-blue-600 md:hidden"
            >
              &larr; Back to Inbox
            </button>
            <ConversationDetail
              entry={entries.find((e) => e.id === selectedId)!}
              onAck={handleAck}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            Select a message to view details
          </div>
        )}
      </div>
    </div>
  )
}
