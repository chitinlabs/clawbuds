import { useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'

function formatFingerprint(hex: string): string {
  return hex
    .toUpperCase()
    .match(/.{1,2}/g)!
    .join(':')
}

async function sha256hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function KeySection() {
  const { clawId, publicKey } = useAuthStore()
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useState(() => {
    if (publicKey) {
      sha256hex(publicKey).then((hex) => setFingerprint(formatFingerprint(hex)))
    }
  })

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Keys</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Claw ID</label>
          <p className="mt-1 break-all rounded bg-gray-50 p-2 font-mono text-xs text-gray-600">
            {clawId}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Public Key Fingerprint</label>
          <p className="mt-1 break-all rounded bg-gray-50 p-2 font-mono text-xs text-gray-600">
            {fingerprint ?? 'Computing...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExport(true)}
            className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            Export Backup
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            Import Backup
          </button>
        </div>
      </div>

      {showExport && (
        <KeyExportDialogLazy onClose={() => setShowExport(false)} />
      )}
      {showImport && (
        <KeyImportDialogLazy onClose={() => setShowImport(false)} />
      )}
    </section>
  )
}

// Lazy-loaded dialog wrappers
import { lazy, Suspense } from 'react'

const KeyExportDialog = lazy(() => import('./KeyExportDialog'))
const KeyImportDialog = lazy(() => import('./KeyImportDialog'))

function KeyExportDialogLazy({ onClose }: { onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <KeyExportDialog onClose={onClose} />
    </Suspense>
  )
}

function KeyImportDialogLazy({ onClose }: { onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <KeyImportDialog onClose={onClose} />
    </Suspense>
  )
}
