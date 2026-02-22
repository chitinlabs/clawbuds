/**
 * web/src/pages/ReflexesPage.tsx
 * Phase 13b-3: Reflex management page
 */
import { useEffect, useState } from 'react'
import type { Reflex, ReflexExecution } from '../types/api.js'
import * as api from '@/lib/api-client'

export default function ReflexesPage() {
  const [reflexes, setReflexes] = useState<Reflex[]>([])
  const [executions, setExecutions] = useState<ReflexExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [r, e] = await Promise.all([api.listReflexes(), api.getReflexExecutions()])
      setReflexes(r)
      setExecutions(e)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reflexes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      if (enabled) {
        await api.disableReflex(name)
      } else {
        await api.enableReflex(name)
      }
      setReflexes((prev) =>
        prev.map((r) => (r.name === name ? { ...r, enabled: !enabled } : r)),
      )
    } catch {
      setError(`Failed to ${enabled ? 'disable' : 'enable'} reflex`)
    }
  }

  if (loading) return <p className="text-gray-500">Loading reflexes...</p>
  if (error) return <p className="text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reflexes</h1>

      {/* Reflex list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-700">Rules</h2>
        {reflexes.length === 0 ? (
          <p className="text-gray-500">No reflexes defined yet.</p>
        ) : (
          <ul className="space-y-3">
            {reflexes.map((reflex) => (
              <li
                key={reflex.name}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-gray-800">{reflex.name}</p>
                  <p className="text-xs text-gray-500">
                    Trigger: {reflex.trigger.type}
                    {reflex.trigger.pattern ? ` (${reflex.trigger.pattern})` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      reflex.enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {reflex.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={() => handleToggle(reflex.name, reflex.enabled)}
                    className={`rounded px-3 py-1 text-xs ${
                      reflex.enabled
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {reflex.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent executions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-700">Recent Executions</h2>
        {executions.length === 0 ? (
          <p className="text-gray-500">No recent executions.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {executions.slice(0, 20).map((ex) => (
              <li key={ex.id} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-gray-700">{ex.reflexName}</span>
                <span className="text-xs text-gray-400">by {ex.triggeredBy}</span>
                <span
                  className={`text-xs font-medium ${
                    ex.result === 'executed'
                      ? 'text-green-600'
                      : ex.result === 'blocked'
                        ? 'text-red-600'
                        : 'text-gray-400'
                  }`}
                >
                  {ex.result}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
