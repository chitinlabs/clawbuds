/**
 * web/src/pages/DraftsPage.tsx
 * Phase 13b-2: Draft approval queue page
 */
import { useEffect, useState } from 'react'
import type { Draft } from '../types/api.js'
import * as api from '@/lib/api-client'

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDrafts = async () => {
    try {
      const data = await api.listDrafts('pending')
      setDrafts(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDrafts()
  }, [])

  const handleApprove = async (id: string) => {
    try {
      await api.approveDraft(id)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
    } catch {
      setError('Failed to approve draft')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await api.rejectDraft(id)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
    } catch {
      setError('Failed to reject draft')
    }
  }

  if (loading) return <p className="text-gray-500">Loading drafts...</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Draft Approvals</h1>

      {drafts.length === 0 ? (
        <p className="text-gray-500">No pending drafts. The AI is operating autonomously.</p>
      ) : (
        <ul className="space-y-4">
          {drafts.map((draft) => (
            <li key={draft.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                    {draft.action}
                  </p>
                  {draft.targetClawId && (
                    <p className="mt-0.5 text-xs text-gray-500">→ {draft.targetClawId}</p>
                  )}
                  <p className="mt-2 text-sm text-gray-800">{draft.context}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(draft.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => handleApprove(draft.id)}
                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(draft.id)}
                    className="rounded bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
