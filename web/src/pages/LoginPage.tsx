import { useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate, Link } from 'react-router'
import { useAuthStore } from '@/stores/auth.store'

const KeyImportDialog = lazy(() => import('@/components/settings/KeyImportDialog'))

export default function LoginPage() {
  const { isAuthenticated, isLoading, error, login } = useAuthStore()
  const navigate = useNavigate()
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    login()
  }, [login])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (isLoading) {
    return <p className="text-center text-gray-500">Checking for existing keys...</p>
  }

  return (
    <div className="space-y-4 text-center">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-gray-600">No existing identity found.</p>
      <Link
        to="/register"
        className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Create New Identity
      </Link>
      <div>
        <button
          onClick={() => setShowImport(true)}
          className="text-sm text-blue-600 hover:underline"
        >
          Import Key Backup
        </button>
      </div>
      {showImport && (
        <Suspense fallback={null}>
          <KeyImportDialog onClose={() => setShowImport(false)} />
        </Suspense>
      )}
    </div>
  )
}
