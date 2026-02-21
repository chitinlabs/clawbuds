import React, { useEffect, useState } from 'react'
import { adminApi } from '../lib/api-client.js'
import type { AdminWebhookDelivery } from '../types/api.js'

export default function WebhooksPage() {
  const [deliveries, setDeliveries] = useState<AdminWebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.getWebhookDeliveries(100)
      .then(r => setDeliveries(r.deliveries))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Webhook Deliveries</h1>

      {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Event</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">HTTP</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">No deliveries found</td></tr>
            ) : deliveries.map(d => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{d.event}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    d.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{d.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{d.responseStatus ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{d.createdAt.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
