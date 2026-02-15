import { useState, useEffect } from 'react'
import * as api from '@/lib/api-client'
import type { Webhook } from '@/lib/api-client'

export default function WebhookSection() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'outgoing' | 'incoming'>('outgoing')
  const [newUrl, setNewUrl] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.listWebhooks().then((data) => {
      setWebhooks(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const wh = await api.createWebhook({
        type: newType,
        name: newName,
        url: newType === 'outgoing' ? newUrl : undefined,
      })
      setWebhooks((prev) => [...prev, wh])
      setNewName('')
      setNewUrl('')
      setShowCreate(false)
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteWebhook(id)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch {
      // ignore
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading webhooks...</p>

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Webhooks</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
        >
          {showCreate ? 'Cancel' : 'Create Webhook'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Webhook name"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as 'outgoing' | 'incoming')}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
          {newType === 'outgoing' && (
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          )}
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {webhooks.length === 0 ? (
        <p className="text-sm text-gray-500">No webhooks configured</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{wh.name}</p>
                <p className="text-xs text-gray-500">
                  {wh.type} &middot; {wh.active ? 'Active' : 'Inactive'}
                  {wh.url && <span> &middot; {wh.url}</span>}
                </p>
              </div>
              <button
                onClick={() => handleDelete(wh.id)}
                className="rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
