/**
 * web/src/pages/PearlsPage.tsx
 * Phase 13b-1: Pearl management page
 */
import { useEffect, useState } from 'react'
import type { Pearl } from '../types/api.js'
import * as api from '@/lib/api-client'

export default function PearlsPage() {
  const [pearls, setPearls] = useState<Pearl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPearls = async () => {
    try {
      const data = await api.listPearls()
      setPearls(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pearls')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPearls()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await api.deletePearl(id)
      setPearls((prev) => prev.filter((p) => p.id !== id))
    } catch {
      setError('Failed to delete pearl')
    }
  }

  if (loading) return <p className="text-gray-500">Loading pearls...</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Pearls</h1>

      {pearls.length === 0 ? (
        <p className="text-gray-500">No pearls yet. Pearls are created automatically by the AI.</p>
      ) : (
        <ul className="space-y-4">
          {pearls.map((pearl) => (
            <li key={pearl.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{pearl.content}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {pearl.domainTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span>Luster: <strong className="text-gray-700">{pearl.luster.toFixed(2)}</strong></span>
                    <span>Shares: {pearl.shareCount}</span>
                    <span>Endorsements: {pearl.endorsementCount}</span>
                    <span className="capitalize">{pearl.visibility}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(pearl.id)}
                  className="shrink-0 rounded bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
