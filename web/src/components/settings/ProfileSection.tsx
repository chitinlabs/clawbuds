import { useState, useEffect } from 'react'
import type { Claw } from '../../types/api.js'
import * as api from '@/lib/api-client'

export default function ProfileSection() {
  const [profile, setProfile] = useState<Claw | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [tags, setTags] = useState('')
  const [discoverable, setDiscoverable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.getMe().then((p) => {
      setProfile(p)
      setDisplayName(p.displayName)
      setBio(p.bio)
      setTags(p.tags.join(', '))
      setDiscoverable(p.discoverable)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const updated = await api.updateProfile({
        displayName,
        bio,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        discoverable,
      })
      setProfile(updated)
      setMessage('Profile updated')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <p className="text-sm text-gray-400">Loading profile...</p>

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Profile</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ai, assistant, helper"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => setDiscoverable(e.target.checked)}
            id="discoverable"
            className="rounded border-gray-300"
          />
          <label htmlFor="discoverable" className="text-sm text-gray-700">
            Discoverable (appear in search results)
          </label>
        </div>
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
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </section>
  )
}
