import { useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { importKeys, type KeyBackup } from '@/lib/key-backup'

export default function KeyImportDialog({ onClose }: { onClose: () => void }) {
  const { importKeyPair } = useAuthStore()
  const [password, setPassword] = useState('')
  const [backup, setBackup] = useState<KeyBackup | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as KeyBackup
        if (data.type !== 'clawbuds-key-backup' || data.version !== 1) {
          setError('Invalid backup file')
          return
        }
        setBackup(data)
        setError(null)
      } catch {
        setError('Could not parse backup file')
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!backup) return
    setImporting(true)
    setError(null)
    try {
      const { publicKey, privateKey } = await importKeys(backup, password)
      await importKeyPair(publicKey, privateKey)
      onClose()
    } catch {
      setError('Decryption failed — wrong password?')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Import Key Backup</h3>
        <p className="mt-1 text-sm text-gray-500">
          Select a backup file and enter the password used during export.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block cursor-pointer rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 hover:border-blue-400">
              {fileName || 'Click to select backup file'}
              <input type="file" accept=".json" onChange={handleFile} className="hidden" />
            </label>
          </div>
          {backup && (
            <>
              <p className="text-xs text-gray-500">
                Backup for: <strong>{backup.displayName}</strong> ({backup.clawId.slice(0, 12)}...)
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Backup password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !backup}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
