import { useState } from 'react'
import { del } from 'idb-keyval'
import { useAuthStore } from '@/stores/auth.store'

export default function DangerZone() {
  const { logout } = useAuthStore()
  const [confirming, setConfirming] = useState(false)

  const handleClearKeys = async () => {
    await del('privateKey')
    await del('publicKey')
    logout()
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-red-700">Danger Zone</h2>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">
          Clear your local keys. This will remove your identity from this browser.
          Make sure you have exported a backup first!
        </p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-3 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Clear Local Keys
          </button>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleClearKeys}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            >
              Confirm — Delete Keys
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
