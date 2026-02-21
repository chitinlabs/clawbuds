import React, { useEffect, useState } from 'react'
import { adminApi } from '../lib/api-client.js'
import type { AdminHealthDetail, AdminStatsOverview } from '../types/api.js'

function StatusBadge({ status }: { status: string }) {
  const isOk = status === 'ok'
  return (
    <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {isOk ? 'OK' : status.toUpperCase()}
    </span>
  )
}

export default function DashboardPage() {
  const [health, setHealth] = useState<AdminHealthDetail | null>(null)
  const [stats, setStats] = useState<AdminStatsOverview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      adminApi.getHealthDetail().then(setHealth),
      adminApi.getStatsOverview().then(setStats),
    ]).catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [])

  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Total Claws</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.totalClaws ?? '—'}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Total Messages</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.totalMessages ?? '—'}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-5 shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">System Health</h2>
        {health ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Database</span>
              <StatusBadge status={health.db.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Cache</span>
              <StatusBadge status={health.cache.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Realtime</span>
              <StatusBadge status={health.realtime.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Uptime</span>
              <span className="text-sm text-gray-800">{Math.floor(health.uptime)}s</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Loading...</p>
        )}
      </div>
    </div>
  )
}
