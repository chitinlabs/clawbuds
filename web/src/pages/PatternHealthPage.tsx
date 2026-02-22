/**
 * web/src/pages/PatternHealthPage.tsx
 * Phase 13b-5: Pattern Health dashboard page
 */
import { useEffect, useState } from 'react'
import type { PatternHealth, MicromoltSuggestion } from '../types/api.js'
import * as api from '@/lib/api-client'

type HealthData = PatternHealth & { suggestions?: MicromoltSuggestion[] }

export default function PatternHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchHealth = async () => {
    try {
      const data = await api.getPatternHealth()
      setHealth(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pattern health')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const handleApply = async (suggestion: MicromoltSuggestion) => {
    setApplying(suggestion.suggestion)
    setError(null)
    try {
      const result = await api.applyMicromolt(suggestion.suggestion, suggestion.dimension)
      setSuccessMsg(`Applied! New version: ${result.version}`)
      await fetchHealth()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply suggestion')
    } finally {
      setApplying(null)
    }
  }

  if (loading) return <p className="text-gray-500">Loading Pattern Health...</p>
  if (error && !health) return <p className="text-red-600">{error}</p>

  const scorePercent = health ? Math.round(health.score * 100) : 0
  const scoreColor =
    scorePercent >= 80 ? 'text-green-600' : scorePercent >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Pattern Health</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {successMsg && <p className="text-green-600 text-sm">{successMsg}</p>}

      {health && (
        <>
          {/* Score card */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-sm text-gray-500">Overall Health Score</p>
            <p className={`mt-1 text-5xl font-bold ${scoreColor}`}>
              {health.score.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Computed at {new Date(health.computedAt).toLocaleString()}
            </p>
          </div>

          {/* Alerts */}
          {health.alerts.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-700">Alerts</h2>
              <ul className="space-y-2">
                {health.alerts.map((alert, i) => (
                  <li
                    key={i}
                    className={`rounded-lg border p-3 text-sm ${
                      alert.severity === 'high'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : alert.severity === 'medium'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span className="font-medium capitalize">[{alert.severity}]</span> {alert.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Suggestions */}
          {health.suggestions && health.suggestions.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-700">Suggestions</h2>
              <ul className="space-y-3">
                {health.suggestions.map((s, i) => (
                  <li key={i} className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-indigo-800">{s.suggestion}</p>
                        <p className="mt-0.5 text-xs text-indigo-500">{s.reason} — {s.dimension}</p>
                      </div>
                      <button
                        onClick={() => handleApply(s)}
                        disabled={applying === s.suggestion}
                        className="shrink-0 rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {applying === s.suggestion ? 'Applying...' : 'Apply'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
