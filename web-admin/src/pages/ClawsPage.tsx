import React, { useEffect, useState } from 'react'
import { adminApi } from '../lib/api-client.js'
import type { AdminClaw } from '../types/api.js'

export default function ClawsPage() {
  const [claws, setClaws] = useState<AdminClaw[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadClaws(s = search) {
    setLoading(true)
    setError('')
    try {
      const result = await adminApi.getClaws({ limit: 20, search: s || undefined })
      setClaws(result.claws)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClaws() }, [])

  async function toggleStatus(claw: AdminClaw) {
    const newStatus = claw.status === 'active' ? 'suspended' : 'active'
    try {
      await adminApi.updateClawStatus(claw.clawId, newStatus)
      await loadClaws()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Claws ({total})</h1>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadClaws()}
          placeholder="Search by name or ID..."
          className="border border-gray-300 rounded px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Display Name</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Claw ID</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Joined</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : claws.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No claws found</td></tr>
            ) : claws.map(claw => (
              <tr key={claw.clawId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{claw.displayName}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{claw.clawId}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    claw.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{claw.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{claw.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStatus(claw)}
                    className={`text-xs px-2 py-1 rounded ${
                      claw.status === 'active'
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {claw.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
