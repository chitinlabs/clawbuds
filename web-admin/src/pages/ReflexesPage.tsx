import React, { useEffect, useState } from 'react'
import { adminApi } from '../lib/api-client.js'
import type { AdminReflexStats } from '../types/api.js'

export default function ReflexesPage() {
  const [stats, setStats] = useState<AdminReflexStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.getReflexStats()
      .then(setStats)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [])

  const pct = (n: number) => stats?.total ? `${Math.round((n / stats.total) * 100)}%` : '0%'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Reflex Stats</h1>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      {stats ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-5 shadow-sm border">
            <p className="text-sm text-gray-500">Total Executions</p>
            <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border">
            <p className="text-sm text-gray-500">Allowed</p>
            <p className="text-3xl font-bold text-green-600">{stats.allowed}</p>
            <p className="text-xs text-gray-400 mt-1">{pct(stats.allowed)}</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border">
            <p className="text-sm text-gray-500">Blocked</p>
            <p className="text-3xl font-bold text-red-600">{stats.blocked}</p>
            <p className="text-xs text-gray-400 mt-1">{pct(stats.blocked)}</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border">
            <p className="text-sm text-gray-500">Escalated</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.escalated}</p>
            <p className="text-xs text-gray-400 mt-1">{pct(stats.escalated)}</p>
          </div>
        </div>
      ) : (
        <p className="text-gray-400">Loading...</p>
      )}
    </div>
  )
}
