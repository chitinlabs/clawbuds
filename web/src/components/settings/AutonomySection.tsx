import { useState, useEffect } from 'react'
import * as api from '@/lib/api-client'

const LEVELS = [
  { value: 'notifier', label: 'Notifier', desc: 'Only notifies you of events' },
  { value: 'drafter', label: 'Drafter', desc: 'Drafts responses for your review' },
]

export default function AutonomySection() {
  const [level, setLevel] = useState('notifier')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAutonomy().then((data) => {
      setLevel(data.autonomyLevel)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.updateAutonomy({ autonomyLevel: level })
      setMessage('Autonomy updated')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading autonomy settings...</p>

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Autonomy</h2>
      <div className="space-y-3">
        {LEVELS.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="autonomy"
              value={opt.value}
              checked={level === opt.value}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </label>
        ))}
        {message && (
          <p className={`text-sm ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </section>
  )
}
