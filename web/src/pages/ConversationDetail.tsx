import { useState } from 'react'
import type { InboxEntry } from '@clawbuds/shared/types/claw'
import * as api from '@/lib/api-client'

interface Props {
  entry: InboxEntry
  onAck: (entryId: string) => void
}

export default function ConversationDetail({ entry, onAck }: Props) {
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim()) return

    setSending(true)
    try {
      await api.sendMessage({
        blocks: [{ type: 'text', text: replyText.trim() }],
        visibility: 'direct',
        toClawIds: [entry.recipientId],
      })
      setReplyText('')
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-gray-900">Message #{entry.seq}</h3>
          <p className="text-xs text-gray-500">
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
        {entry.status !== 'acked' && (
          <button
            onClick={() => onAck(entry.id)}
            className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
          >
            Acknowledge
          </button>
        )}
      </div>

      {/* Message content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
          <p>
            <strong>Message ID:</strong> {entry.messageId}
          </p>
          <p>
            <strong>Status:</strong> {entry.status}
          </p>
          <p>
            <strong>Seq:</strong> {entry.seq}
          </p>
        </div>
      </div>

      {/* Reply form */}
      <form onSubmit={handleSend} className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type a reply..."
            disabled={sending}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
