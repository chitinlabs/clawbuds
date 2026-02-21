import { useEffect, useState } from 'react'
import type { ClawStats, InboxEntry } from '../types/api.js'
import * as api from '@/lib/api-client'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useRealtimeStore } from '@/stores/realtime.store'

export default function DashboardPage() {
  const [stats, setStats] = useState<ClawStats | null>(null)
  const [recentInbox, setRecentInbox] = useState<InboxEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { isConnected } = useWebSocket()
  const lastEvent = useRealtimeStore((s) => s.lastEvent)

  const fetchData = async () => {
    try {
      const [statsData, inboxData] = await Promise.all([
        api.getStats(),
        api.getInbox({ status: 'unread', limit: 5 }),
      ])
      setStats(statsData)
      setRecentInbox(inboxData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Re-fetch on new realtime events
  useEffect(() => {
    if (lastEvent) {
      fetchData()
    }
  }, [lastEvent])

  if (loading) {
    return <p className="text-gray-500">Loading dashboard...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Messages Sent" value={stats.messagesSent} />
          <StatCard label="Messages Received" value={stats.messagesReceived} />
          <StatCard label="Friends" value={stats.friendsCount} />
        </div>
      )}

      {/* Recent unread inbox */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Recent Unread</h2>
        {recentInbox.length === 0 ? (
          <p className="text-sm text-gray-500">No unread messages</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {recentInbox.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    Message #{entry.seq} from {entry.recipientId}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
